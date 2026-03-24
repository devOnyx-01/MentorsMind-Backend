import { TokenService } from '../token.service';
import { JwtUtils } from '../../utils/jwt.utils';
import { testPool } from '../../tests/setup';

describe('TokenService Hardening', () => {
  let userId: string;
  const email = 'test@example.com';
  const role = 'user';

  beforeEach(async () => {
    // Create a test user
    const { rows } = await testPool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [email, 'hash', 'Test', 'User', role],
    );
    userId = rows[0].id;
  });

  it('should issue tokens and store refresh token hash', async () => {
    const tokens = await TokenService.issueTokens(userId, email, role);
    expect(tokens.accessToken).toBeDefined();
    expect(tokens.refreshToken).toBeDefined();

    const hash = JwtUtils.hashToken(tokens.refreshToken);
    const { rows } = await testPool.query(
      'SELECT * FROM refresh_tokens WHERE token_hash = $1',
      [hash],
    );
    expect(rows.length).toBe(1);
    expect(rows[0].user_id).toBe(userId);
    expect(rows[0].revoked_at).toBeNull();
  });

  it('should rotate refresh tokens and revoke old one', async () => {
    const oldTokens = await TokenService.issueTokens(userId, email, role);
    const oldHash = JwtUtils.hashToken(oldTokens.refreshToken);

    const newTokens = await TokenService.rotateRefreshToken(
      oldTokens.refreshToken,
    );
    expect(newTokens.refreshToken).not.toBe(oldTokens.refreshToken);

    const { rows: oldRows } = await testPool.query(
      'SELECT * FROM refresh_tokens WHERE token_hash = $1',
      [oldHash],
    );
    expect(oldRows[0].revoked_at).not.toBeNull();
    expect(oldRows[0].replaced_by).toBeDefined();

    const newHash = JwtUtils.hashToken(newTokens.refreshToken);
    const { rows: newRows } = await testPool.query(
      'SELECT * FROM refresh_tokens WHERE token_hash = $1',
      [newHash],
    );
    expect(newRows[0].revoked_at).toBeNull();
    expect(newRows[0].family_id).toBe(oldRows[0].family_id);
  });

  it('should detect token reuse and revoke entire family', async () => {
    const tokens = await TokenService.issueTokens(userId, email, role);

    // First rotation
    await TokenService.rotateRefreshToken(tokens.refreshToken);

    // Attempt to use the OLD token again (REUSE!)
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

  it('should enforce concurrent session limit', async () => {
    const limit = 5;
    for (let i = 0; i < limit + 2; i++) {
      await TokenService.issueTokens(userId, email, role);
    }

    const { rows } = await testPool.query(
      'SELECT * FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW()',
      [userId],
    );
    expect(rows.length).toBe(limit);
  });

  it('should blacklist access tokens', async () => {
    const jti = 'test-jti';
    const exp = Math.floor(Date.now() / 1000) + 3600;

    await TokenService.blacklistToken(jti, exp);
    const isBlacklisted = await TokenService.isTokenBlacklisted(jti);
    expect(isBlacklisted).toBe(true);
  });

  it('should detect device fingerprint mismatch', async () => {
    const fingerprint1 = 'device-1';
    const fingerprint2 = 'device-2';

    const tokens = await TokenService.issueTokens(
      userId,
      email,
      role,
      fingerprint1,
    );

    await expect(
      TokenService.rotateRefreshToken(tokens.refreshToken, fingerprint2),
    ).rejects.toThrow('Device mismatch');
  });
});
