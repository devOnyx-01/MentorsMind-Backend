import { TokenService } from '../token.service';
import { JwtUtils } from '../../utils/jwt.utils';
import { testPool } from '../../tests/setup';

describe('Token Security - Enhanced Testing', () => {
  let userId: string;
  const email = 'security@example.com';
  const role = 'user';

  beforeEach(async () => {
    const { rows } = await testPool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [email, 'hash', 'Security', 'Test', role],
    );
    userId = rows[0].id;
  });

  describe('Token Rotation Security', () => {
    it('should handle rapid token rotation attempts', async () => {
      const tokens = await TokenService.issueTokens(userId, email, role);

      // Rotate token
      const rotated1 = await TokenService.rotateRefreshToken(
        tokens.refreshToken,
      );

      // Try to rotate the same token again immediately
      await expect(
        TokenService.rotateRefreshToken(tokens.refreshToken),
      ).rejects.toThrow('Suspicious activity detected');

      // Verify the valid rotated token still works
      const rotated2 = await TokenService.rotateRefreshToken(
        rotated1.refreshToken,
      );
      expect(rotated2.refreshToken).toBeDefined();
      expect(rotated2.accessToken).toBeDefined();
    });

    it('should handle concurrent rotation attempts', async () => {
      const tokens = await TokenService.issueTokens(userId, email, role);

      // Simulate concurrent rotation attempts
      const promises = [
        TokenService.rotateRefreshToken(tokens.refreshToken),
        TokenService.rotateRefreshToken(tokens.refreshToken),
        TokenService.rotateRefreshToken(tokens.refreshToken),
      ];

      const results = await Promise.allSettled(promises);

      // Only one should succeed
      const successful = results.filter((r) => r.status === 'fulfilled');
      const failed = results.filter((r) => r.status === 'rejected');

      expect(successful.length).toBe(1);
      expect(failed.length).toBe(2);

      // Failed attempts should be due to suspicious activity
      failed.forEach((result) => {
        if (result.status === 'rejected') {
          expect(result.reason.message).toContain(
            'Suspicious activity detected',
          );
        }
      });
    });

    it('should maintain token family integrity during rotation', async () => {
      const tokens = await TokenService.issueTokens(userId, email, role);

      // Get initial family ID
      const initialHash = JwtUtils.hashToken(tokens.refreshToken);
      const { rows: initialRows } = await testPool.query(
        'SELECT family_id FROM refresh_tokens WHERE token_hash = $1',
        [initialHash],
      );
      const familyId = initialRows[0].family_id;

      // Perform multiple rotations
      let currentToken = tokens.refreshToken;
      for (let i = 0; i < 3; i++) {
        const rotated = await TokenService.rotateRefreshToken(currentToken);
        currentToken = rotated.refreshToken;

        // Verify new token has same family ID
        const newHash = JwtUtils.hashToken(currentToken);
        const { rows } = await testPool.query(
          'SELECT family_id FROM refresh_tokens WHERE token_hash = $1',
          [newHash],
        );
        expect(rows[0].family_id).toBe(familyId);
      }
    });
  });

  describe('Theft Detection', () => {
    it('should detect and handle token replay attacks', async () => {
      const tokens = await TokenService.issueTokens(userId, email, role);

      // Normal rotation
      await TokenService.rotateRefreshToken(tokens.refreshToken);

      // Attacker tries to use original token (replay attack)
      await expect(
        TokenService.rotateRefreshToken(tokens.refreshToken),
      ).rejects.toThrow('Suspicious activity detected');

      // Verify all tokens in family are revoked
      const { rows } = await testPool.query(
        'SELECT * FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL',
        [userId],
      );
      expect(rows.length).toBe(0);
    });

    it('should handle device fingerprint spoofing attempts', async () => {
      const legitimateFingerprint = 'legitimate-device-123';
      const maliciousFingerprint = 'malicious-device-456';

      const tokens = await TokenService.issueTokens(
        userId,
        email,
        role,
        legitimateFingerprint,
      );

      // Attacker tries to rotate with different fingerprint
      await expect(
        TokenService.rotateRefreshToken(
          tokens.refreshToken,
          maliciousFingerprint,
        ),
      ).rejects.toThrow('Device mismatch');

      // Verify token family is revoked due to suspicious activity
      const { rows } = await testPool.query(
        'SELECT * FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL',
        [userId],
      );
      expect(rows.length).toBe(0);
    });

    it('should detect token family compromise and revoke all related tokens', async () => {
      const fingerprint = 'test-device';

      // Create multiple tokens in same family through rotation
      const tokens1 = await TokenService.issueTokens(
        userId,
        email,
        role,
        fingerprint,
      );
      const tokens2 = await TokenService.rotateRefreshToken(
        tokens1.refreshToken,
        fingerprint,
      );
      await TokenService.rotateRefreshToken(tokens2.refreshToken, fingerprint);

      // Simulate compromise - try to use an old token
      await expect(
        TokenService.rotateRefreshToken(tokens1.refreshToken, fingerprint),
      ).rejects.toThrow('Suspicious activity detected');

      // Verify ALL tokens in family are revoked
      const { rows } = await testPool.query(
        'SELECT * FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL',
        [userId],
      );
      expect(rows.length).toBe(0);
    });
  });

  describe('Blacklist Invalidation', () => {
    it('should properly blacklist tokens with different expiration times', async () => {
      const currentTime = Math.floor(Date.now() / 1000);
      const shortExp = currentTime + 300; // 5 minutes
      const longExp = currentTime + 3600; // 1 hour

      await TokenService.blacklistToken('short-token', shortExp);
      await TokenService.blacklistToken('long-token', longExp);

      expect(await TokenService.isTokenBlacklisted('short-token')).toBe(true);
      expect(await TokenService.isTokenBlacklisted('long-token')).toBe(true);
    });

    it('should handle blacklist cleanup for expired tokens', async () => {
      const pastTime = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      const futureTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

      await TokenService.blacklistToken('expired-token', pastTime);
      await TokenService.blacklistToken('valid-token', futureTime);

      // Expired token should not be considered blacklisted
      expect(await TokenService.isTokenBlacklisted('expired-token')).toBe(
        false,
      );
      expect(await TokenService.isTokenBlacklisted('valid-token')).toBe(true);
    });

    it('should handle duplicate blacklist entries gracefully', async () => {
      const jti = 'duplicate-test-token';
      const exp = Math.floor(Date.now() / 1000) + 3600;

      // Add same token multiple times
      await TokenService.blacklistToken(jti, exp);
      await TokenService.blacklistToken(jti, exp);
      await TokenService.blacklistToken(jti, exp);

      // Should still be blacklisted
      expect(await TokenService.isTokenBlacklisted(jti)).toBe(true);

      // Verify only one entry exists
      const { rows } = await testPool.query(
        'SELECT COUNT(*) as count FROM token_blacklist WHERE token_jti = $1',
        [jti],
      );
      expect(parseInt(rows[0].count)).toBe(1);
    });

    it('should handle mass blacklist operations', async () => {
      const tokens = [];
      const exp = Math.floor(Date.now() / 1000) + 3600;

      // Create multiple tokens to blacklist
      for (let i = 0; i < 100; i++) {
        const jti = `mass-token-${i}`;
        tokens.push(jti);
        await TokenService.blacklistToken(jti, exp);
      }

      // Verify all are blacklisted
      for (const token of tokens) {
        expect(await TokenService.isTokenBlacklisted(token)).toBe(true);
      }
    });
  });

  describe('Concurrent Session Management', () => {
    it('should enforce session limit across multiple devices', async () => {
      const devices = [
        'device-1',
        'device-2',
        'device-3',
        'device-4',
        'device-5',
        'device-6',
      ];

      // Create sessions on multiple devices (exceeding limit of 5)
      for (const device of devices) {
        await TokenService.issueTokens(userId, email, role, device);
      }

      // Should only have 5 active sessions
      const { rows } = await testPool.query(
        'SELECT * FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW()',
        [userId],
      );
      expect(rows.length).toBe(5);
    });

    it('should handle rapid session creation attempts', async () => {
      // Create multiple sessions rapidly
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          TokenService.issueTokens(userId, email, role, `device-${i}`),
        );
      }

      await Promise.all(promises);

      // Should still respect session limit
      const { rows } = await testPool.query(
        'SELECT * FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW()',
        [userId],
      );
      expect(rows.length).toBe(5);
    });

    it('should maintain session limit during token rotation', async () => {
      // Create maximum sessions
      const tokens = [];
      for (let i = 0; i < 5; i++) {
        const token = await TokenService.issueTokens(
          userId,
          email,
          role,
          `device-${i}`,
        );
        tokens.push(token);
      }

      // Rotate some tokens
      await TokenService.rotateRefreshToken(tokens[0].refreshToken, 'device-0');
      await TokenService.rotateRefreshToken(tokens[1].refreshToken, 'device-1');

      // Should still have exactly 5 active sessions
      const { rows } = await testPool.query(
        'SELECT * FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW()',
        [userId],
      );
      expect(rows.length).toBe(5);
    });

    it('should handle session revocation correctly', async () => {
      // Create multiple sessions
      const tokens = [];
      for (let i = 0; i < 3; i++) {
        const token = await TokenService.issueTokens(
          userId,
          email,
          role,
          `device-${i}`,
        );
        tokens.push(token);
      }

      // Revoke one session
      await TokenService.revokeRefreshToken(tokens[1].refreshToken);

      // Should have 2 active sessions
      const { rows } = await testPool.query(
        'SELECT * FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW()',
        [userId],
      );
      expect(rows.length).toBe(2);

      // Should be able to create new session
      await TokenService.issueTokens(userId, email, role, 'new-device');

      const { rows: newRows } = await testPool.query(
        'SELECT * FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW()',
        [userId],
      );
      expect(newRows.length).toBe(3);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle malformed refresh tokens', async () => {
      const malformedTokens = [
        'invalid.token.here',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature',
        '',
        null,
        undefined,
      ];

      for (const token of malformedTokens) {
        if (token !== null && token !== undefined) {
          await expect(TokenService.rotateRefreshToken(token)).rejects.toThrow(
            'Invalid refresh token',
          );
        }
      }
    });

    it('should handle database connection issues gracefully', async () => {
      // This test would require mocking database failures
      // For now, we'll test that the service handles basic error cases
      const tokens = await TokenService.issueTokens(userId, email, role);

      // Try to use a token that doesn't exist in DB
      const fakeToken = tokens.refreshToken.replace(/.$/, 'x'); // Modify last character

      await expect(TokenService.rotateRefreshToken(fakeToken)).rejects.toThrow(
        'Invalid refresh token',
      );
    });

    it('should handle expired refresh tokens', async () => {
      // Create a token and manually expire it in the database
      const tokens = await TokenService.issueTokens(userId, email, role);
      const tokenHash = JwtUtils.hashToken(tokens.refreshToken);

      // Manually set expiration to past
      await testPool.query(
        "UPDATE refresh_tokens SET expires_at = NOW() - INTERVAL '1 hour' WHERE token_hash = $1",
        [tokenHash],
      );

      // Should reject expired token
      await expect(
        TokenService.rotateRefreshToken(tokens.refreshToken),
      ).rejects.toThrow();
    });
  });
});
