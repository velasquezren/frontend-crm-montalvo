import fs from 'fs';
import path from 'path';

// Generador de audio WAV de 16-bit 44.1kHz PCM
// Sonido: Doble tono suave tipo campana (Chime de notificación comercial/médica)
function generarChimeNotification() {
  const sampleRate = 44100;
  const numChannels = 1;
  const bitsPerSample = 16;
  
  // Tono 1: 880 Hz (A5), Tono 2: 1320 Hz (E6) con armónicos y decaimiento suave
  const duration = 0.45; // 450 ms
  const totalSamples = Math.floor(sampleRate * duration);
  const dataSize = totalSamples * numChannels * (bitsPerSample / 8);
  
  const buffer = Buffer.alloc(44 + dataSize);
  
  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  
  // Subchunk 1 "fmt "
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size
  buffer.writeUInt16LE(1, 20);  // AudioFormat (PCM)
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * (bitsPerSample / 8), 28); // ByteRate
  buffer.writeUInt16LE(numChannels * (bitsPerSample / 8), 32); // BlockAlign
  buffer.writeUInt16LE(bitsPerSample, 34);
  
  // Subchunk 2 "data"
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  
  let offset = 44;
  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    
    // Pulso 1 a t=0ms (880Hz), Pulso 2 a t=100ms (1320Hz)
    let env1 = Math.exp(-t * 18);
    let tone1 = Math.sin(2 * Math.PI * 880 * t) * 0.6 + Math.sin(2 * Math.PI * 1760 * t) * 0.2;
    
    let env2 = 0;
    let tone2 = 0;
    if (t > 0.1) {
      const t2 = t - 0.1;
      env2 = Math.exp(-t2 * 14);
      tone2 = Math.sin(2 * Math.PI * 1320 * t2) * 0.7 + Math.sin(2 * Math.PI * 2640 * t2) * 0.25;
    }
    
    const sampleVal = (tone1 * env1 + tone2 * env2) * 0.4;
    const clamped = Math.max(-1, Math.min(1, sampleVal));
    const int16 = Math.floor(clamped * 32767);
    
    buffer.writeInt16LE(int16, offset);
    offset += 2;
  }
  
  return buffer;
}

const wavBuffer = generarChimeNotification();
const outputPath = path.resolve(process.cwd(), 'public/notification.wav');
fs.writeFileSync(outputPath, wavBuffer);
console.log(`✓ Sonido de notificación generado exitosamente en: ${outputPath} (${wavBuffer.length} bytes)`);
