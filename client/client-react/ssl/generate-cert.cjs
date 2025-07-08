const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Generowanie certyfikatu SSL...');

// Sprawdź czy OpenSSL jest dostępne
try {
  const keyPath = path.join(__dirname, 'key.pem');
  const certPath = path.join(__dirname, 'cert.pem');
  
  // Generuj certyfikat dla IP adresu
  const command = `openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -days 365 -nodes -subj "/C=PL/ST=State/L=City/O=WatchParty/CN=192.168.0.139" -addext "subjectAltName=IP:192.168.0.139,DNS:localhost"`;
  
  execSync(command, { stdio: 'inherit' });
  
  console.log('✅ Certyfikat SSL został wygenerowany!');
  console.log(`Klucz: ${keyPath}`);
  console.log(`Certyfikat: ${certPath}`);
  
} catch (error) {
  console.error('❌ Błąd podczas generowania certyfikatu:', error.message);
  console.log('\n📝 Alternatywnie możesz:');
  console.log('1. Zainstalować OpenSSL: https://slproweb.com/products/Win32OpenSSL.html');
  console.log('2. Lub użyć online generatora: https://www.selfsignedcertificate.com/');
  console.log('3. Lub uruchomić bez HTTPS (kamera może nie działać na IP)');
} 