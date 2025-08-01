// Decode Jupiter transaction data
const crypto = require('crypto');

// Jupiter instruction data from the transaction
const instructionData = [229, 23, 203, 151, 122, 227, 173, 42, 1, 0, 0, 0, 77, 100, 0, 1, 239, 22, 91, 0, 0, 0, 0, 0, 224, 82, 135, 17, 35, 7, 0, 0, 208, 7, 10];

console.log('=== INSTRUCTION DATA ANALYSIS ===');
console.log('Full data:', instructionData);
console.log('Length:', instructionData.length, 'bytes');

// Break down by common patterns
console.log('\n--- Potential Structure ---');
console.log('First 8 bytes (discriminator):', instructionData.slice(0, 8));
console.log('Bytes 8-16:', instructionData.slice(8, 16));
console.log('Bytes 16-24:', instructionData.slice(16, 24));
console.log('Bytes 24-32:', instructionData.slice(24, 32));
console.log('Last 3 bytes:', instructionData.slice(32));

// Try to interpret as numbers (little endian)
function readU64LE(buffer, offset) {
  const low = buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16) | (buffer[offset + 3] << 24);
  const high = buffer[offset + 4] | (buffer[offset + 5] << 8) | (buffer[offset + 6] << 16) | (buffer[offset + 7] << 24);
  return high * 0x100000000 + low;
}

function readU32LE(buffer, offset) {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16) | (buffer[offset + 3] << 24);
}

console.log('\n--- Numeric Interpretations ---');
console.log('Bytes 0-7 as u64:', readU64LE(instructionData, 0));
console.log('Bytes 8-15 as u64:', readU64LE(instructionData, 8));
console.log('Bytes 16-23 as u64:', readU64LE(instructionData, 16));
console.log('Bytes 24-31 as u64:', readU64LE(instructionData, 24));

console.log('\nBytes 8-11 as u32:', readU32LE(instructionData, 8));
console.log('Bytes 12-15 as u32:', readU32LE(instructionData, 12));
console.log('Bytes 16-19 as u32:', readU32LE(instructionData, 16));
console.log('Bytes 20-23 as u32:', readU32LE(instructionData, 20));

// Create hash for fingerprinting
const hash = crypto.createHash('sha256').update(Buffer.from(instructionData)).digest('hex');
console.log('\n--- Fingerprinting ---');
console.log('SHA256 hash:', hash);
console.log('Short hash (first 16 chars):', hash.substring(0, 16));

console.log('\n=== PROGRAM RETURN DATA ANALYSIS ===');
const returnDataB64 = '3Zh81zgHAAA=';
const returnDataBuffer = Buffer.from(returnDataB64, 'base64');
const returnDataBytes = Array.from(returnDataBuffer);

console.log('Base64:', returnDataB64);
console.log('Decoded bytes:', returnDataBytes);
console.log('Length:', returnDataBytes.length, 'bytes');

if (returnDataBytes.length >= 8) {
  console.log('As u64:', readU64LE(returnDataBytes, 0));
}
if (returnDataBytes.length >= 4) {
  console.log('First 4 bytes as u32:', readU32LE(returnDataBytes, 0));
  if (returnDataBytes.length >= 8) {
    console.log('Last 4 bytes as u32:', readU32LE(returnDataBytes, 4));
  }
}

// Try as hex
console.log('As hex:', returnDataBuffer.toString('hex'));

console.log('\n=== COMBINED FINGERPRINT ===');
const combinedData = Buffer.concat([
  Buffer.from(instructionData),
  returnDataBuffer
]);
const combinedHash = crypto.createHash('sha256').update(combinedData).digest('hex');
console.log('Combined hash:', combinedHash);
console.log('Combined short hash:', combinedHash.substring(0, 16));

// Known amounts from the transaction
console.log('\n=== KNOWN TRADE DATA ===');
console.log('SOL transferred:', 8008927, 'lamports');
console.log('SOL amount:', 8008927 / 1e9, 'SOL');

// Check if any of our decoded numbers match known amounts
const knownAmount = 8008927;
console.log('\n--- Searching for known amounts ---');
for (let i = 0; i <= instructionData.length - 8; i += 1) {
  const value = readU64LE(instructionData, i);
  if (value === knownAmount) {
    console.log(`Found matching amount at offset ${i}:`, value);
  }
  if (i <= instructionData.length - 4) {
    const value32 = readU32LE(instructionData, i);
    if (value32 === knownAmount) {
      console.log(`Found matching amount (u32) at offset ${i}:`, value32);
    }
  }
}