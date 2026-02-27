// Generate a random 32-character Base32 secret for TOTP 2FA
var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
var secret = '';
for (var i = 0; i < 32; i++) {
  secret += chars[Math.floor(Math.random() * chars.length)];
}
console.log(secret);
