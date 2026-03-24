# Token Security Model

## Overview

The MentorsMind API implements a comprehensive token security model designed to protect against common JWT vulnerabilities and attacks. This document outlines the security mechanisms, threat mitigations, and implementation details.

## Security Architecture

### Token Types

1. **Access Tokens**
   - Short-lived (15 minutes)
   - Used for API authentication
   - Contains user identity and permissions
   - Can be blacklisted on logout

2. **Refresh Tokens**
   - Longer-lived (7 days)
   - Used to obtain new access tokens
   - Stored securely in database as hashes
   - Subject to rotation and family tracking

### Core Security Mechanisms

#### 1. Token Rotation
- **Automatic Rotation**: Refresh tokens are rotated on each use
- **Family Tracking**: All tokens in a rotation chain share a family ID
- **Atomic Operations**: Rotation is performed in database transactions

#### 2. Theft Detection
- **Reuse Detection**: Using an already-rotated token triggers security response
- **Family Revocation**: Suspicious activity revokes entire token family
- **Device Fingerprinting**: Optional device binding for additional security

#### 3. Blacklist System
- **Access Token Blacklisting**: Immediate invalidation on logout
- **Automatic Cleanup**: Expired blacklist entries are ignored
- **Duplicate Protection**: Prevents duplicate blacklist entries

#### 4. Session Management
- **Concurrent Limits**: Maximum 5 active sessions per user
- **Oldest First**: Exceeding limit revokes oldest sessions
- **Cross-Device Support**: Each device can maintain separate sessions

## Threat Mitigation

### Token Theft Protection

**Scenario**: Attacker steals a refresh token
**Mitigation**: 
- Token rotation ensures stolen token becomes invalid after legitimate use
- Reuse detection triggers family revocation
- Device fingerprinting adds additional verification layer

**Implementation**:
```typescript
// Detect token reuse
if (!tokenRecord && usedRows.length > 0) {
  await this.revokeTokenFamily(family_id);
  throw new Error('Suspicious activity detected. All sessions revoked.');
}
```

### Replay Attacks

**Scenario**: Attacker intercepts and replays tokens
**Mitigation**:
- Short access token lifetime (15 minutes)
- Refresh token rotation prevents replay
- Blacklist system for immediate invalidation

### Session Hijacking

**Scenario**: Attacker gains access to user session
**Mitigation**:
- Device fingerprinting detects device changes
- Concurrent session limits prevent unlimited access
- Family revocation on suspicious activity

**Implementation**:
```typescript
// Verify device fingerprint
if (fingerprint && tokenRecord.device_fingerprint) {
  const hashedFingerprint = JwtUtils.hashFingerprint(fingerprint);
  if (tokenRecord.device_fingerprint !== hashedFingerprint) {
    await this.revokeTokenFamily(tokenRecord.family_id);
    throw new Error('Device mismatch. Session revoked.');
  }
}
```

### Brute Force Attacks

**Scenario**: Attacker attempts to guess or brute force tokens
**Mitigation**:
- Cryptographically secure token generation
- Token hashing in database storage
- Rate limiting (implemented at API level)

## Database Schema

### refresh_tokens Table
```sql
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    family_id UUID NOT NULL,
    device_fingerprint VARCHAR(255),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE,
    replaced_by UUID REFERENCES refresh_tokens(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### token_blacklist Table
```sql
CREATE TABLE token_blacklist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_jti VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## Security Best Practices

### Token Generation
- Use cryptographically secure random number generation
- Include sufficient entropy in token payload
- Sign with strong secret keys (minimum 256 bits)

### Token Storage
- Never store raw tokens in database
- Use SHA-256 hashing for token storage
- Hash device fingerprints for privacy

### Token Transmission
- Always use HTTPS in production
- Include tokens in Authorization header
- Avoid token exposure in URLs or logs

### Error Handling
- Generic error messages to prevent information leakage
- Detailed logging for security monitoring
- Graceful degradation on security failures

## Monitoring and Alerting

### Security Events to Monitor
- Token reuse attempts
- Device fingerprint mismatches
- Excessive session creation
- Blacklist operations
- Family revocations

### Recommended Alerts
- Multiple failed rotation attempts
- Unusual geographic access patterns
- High-frequency token operations
- Database connection failures

## Configuration

### Environment Variables
```bash
JWT_SECRET=your-256-bit-secret
JWT_REFRESH_SECRET=your-256-bit-refresh-secret
JWT_ISSUER=mentorsmind-api
JWT_AUDIENCE=mentorsmind-client
```

### Security Settings
```typescript
const securityConfig = {
  accessTokenTTL: '15m',
  refreshTokenTTL: '7d',
  maxConcurrentSessions: 5,
  enableDeviceFingerprinting: true,
  enableTokenRotation: true
};
```

## Testing Strategy

### Security Test Categories
1. **Token Rotation Tests**: Verify proper rotation and family management
2. **Theft Detection Tests**: Confirm reuse detection and response
3. **Blacklist Tests**: Validate blacklist operations and cleanup
4. **Concurrent Session Tests**: Test session limits and management
5. **Edge Case Tests**: Handle malformed tokens and error conditions

### Test Coverage Requirements
- All security mechanisms must have >95% test coverage
- Include both positive and negative test cases
- Test concurrent operations and race conditions
- Validate error handling and edge cases

## Compliance Considerations

### OWASP Guidelines
- Implements OWASP JWT security best practices
- Addresses common JWT vulnerabilities
- Follows secure coding principles

### Data Protection
- Minimal data exposure in tokens
- Secure token storage and transmission
- User privacy protection through hashing

## Maintenance and Updates

### Regular Security Reviews
- Quarterly security assessment
- Dependency vulnerability scanning
- Token security model evaluation

### Update Procedures
- Coordinated secret rotation
- Backward compatibility considerations
- Security patch deployment

## Troubleshooting

### Common Issues
1. **Token Reuse Errors**: Usually indicates legitimate security response
2. **Device Mismatch**: Check fingerprinting implementation
3. **Session Limit Exceeded**: Normal behavior, oldest sessions revoked
4. **Blacklist Issues**: Verify token JTI extraction

### Debug Information
- Check token family relationships
- Verify device fingerprint consistency
- Monitor session creation patterns
- Review blacklist entries

## Future Enhancements

### Planned Improvements
- Advanced anomaly detection
- Geographic access controls
- Biometric device binding
- Machine learning threat detection

### Scalability Considerations
- Token cleanup automation
- Database partitioning strategies
- Caching layer implementation
- Distributed session management