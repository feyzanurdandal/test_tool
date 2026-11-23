import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
// .env dosyasından 32 byte'lık (64 karakter hex) Master Key alıyoruz.
const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');

/**
 * Düz metin veriyi (API Key vb.) AES-256-GCM ile şifreler.
 */
export function encrypt(text) {
    if (!text || typeof text !== 'string') return text;
    // Eğer zaten şifrelenmişse tekrar şifreleme (enc: prefix kontrolü)
    if (text.startsWith('enc:')) return text;

    const iv = crypto.randomBytes(12); // GCM için 12 byte IV
    const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag().toString('hex');
    
    // Format: enc:IV:AUTHTAG:ENCRYPTED_DATA
    return `enc:${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Şifrelenmiş veriyi çözer.
 */
export function decrypt(encryptedText) {
    if (!encryptedText || typeof encryptedText !== 'string') return encryptedText;
    // Format "enc:" ile başlamıyorsa düz metindir, direkt dön
    if (!encryptedText.startsWith('enc:')) return encryptedText;

    try {
        const parts = encryptedText.split(':');
        if (parts.length !== 4) throw new Error('Geçersiz şifreli değer biçimi.');

        const iv = Buffer.from(parts[1], 'hex');
        const authTag = Buffer.from(parts[2], 'hex');
        const encrypted = parts[3];

        const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (error) {
        // Şifreli metin asla "anahtar" olarak geri döndürülmez; çağıran açık hata görür.
        console.error(" Şifre çözme (Decryption) hatası:", error.message);
        throw new Error('Şifrelenmiş değer çözülemedi (ENCRYPTION_KEY değişmiş veya veri bozuk).');
    }
}