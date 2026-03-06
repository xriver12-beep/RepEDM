const forge = require('node-forge');

try {
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    
    console.log('Testing fingerprint generation...');
    const fingerprint = forge.pki.getPublicKeyFingerprint(cert.publicKey, {
        md: forge.md.sha1.create(),
        encoding: 'hex'
    });
    console.log('Fingerprint:', fingerprint);
} catch (error) {
    console.error('Error:', error);
}
