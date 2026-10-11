//! เข้ารหัสข้อมูลลับที่เก็บในฐานข้อมูล (เช่น LINE channel secret / access token) ด้วย AES-256-GCM
//!
//! ค่าที่เข้ารหัสแล้วขึ้นต้นด้วย `enc:v1:` — ค่าเดิมที่ยังเป็นข้อความธรรมดาอ่านได้ตามปกติและจะถูกเข้ารหัสใหม่ตอนเริ่มระบบ

use std::sync::OnceLock;

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use base64::Engine;
use rand::RngCore;
use sha2::{Digest, Sha256};

const PREFIX: &str = "enc:v1:";
static CIPHER: OnceLock<Aes256Gcm> = OnceLock::new();

/// ตั้งกุญแจครั้งเดียวตอนเริ่มโปรแกรม (กุญแจจริง = SHA-256 ของค่าที่ให้มา)
pub fn init(secret: &str) {
    let key = Sha256::digest(secret.as_bytes());
    let _ = CIPHER.set(Aes256Gcm::new_from_slice(&key).expect("32-byte key"));
}

pub fn is_ready() -> bool {
    CIPHER.get().is_some()
}

/// อ่านกุญแจจาก `APP_SECRET_KEY` หรือไฟล์ `<data_dir>/secret.key` (สร้างให้อัตโนมัติถ้ายังไม่มี)
pub fn load_or_create_key(data_dir: &std::path::Path) -> anyhow::Result<String> {
    if let Ok(k) = std::env::var("APP_SECRET_KEY") {
        if k.len() >= 16 {
            return Ok(k);
        }
        anyhow::bail!("APP_SECRET_KEY ต้องยาวอย่างน้อย 16 ตัวอักษร");
    }
    let path = data_dir.join("secret.key");
    if let Ok(k) = std::fs::read_to_string(&path) {
        return Ok(k.trim().to_string());
    }
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    let key = hex::encode(bytes);
    std::fs::write(&path, &key)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))?;
    }
    tracing::warn!(
        "สร้างกุญแจเข้ารหัสใหม่ที่ {} — สำรองไฟล์นี้ไว้ ถ้าหายจะถอดรหัสข้อมูลลับเดิมไม่ได้",
        path.display()
    );
    Ok(key)
}

pub fn encrypt(plain: &str) -> String {
    if plain.is_empty() || plain.starts_with(PREFIX) {
        return plain.to_string();
    }
    let Some(cipher) = CIPHER.get() else {
        return plain.to_string();
    };
    let mut nonce = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce);
    let Ok(ct) = cipher.encrypt(Nonce::from_slice(&nonce), plain.as_bytes()) else {
        return plain.to_string();
    };
    let mut buf = nonce.to_vec();
    buf.extend(ct);
    format!(
        "{PREFIX}{}",
        base64::engine::general_purpose::STANDARD.encode(buf)
    )
}

/// ถอดรหัส — ค่าที่ไม่ได้เข้ารหัสส่งคืนตามเดิม, ถอดไม่ได้ (กุญแจผิด) คืนค่าว่าง
pub fn decrypt(value: &str) -> String {
    let Some(encoded) = value.strip_prefix(PREFIX) else {
        return value.to_string();
    };
    let Some(cipher) = CIPHER.get() else {
        return String::new();
    };
    let Ok(buf) = base64::engine::general_purpose::STANDARD.decode(encoded) else {
        return String::new();
    };
    if buf.len() < 13 {
        return String::new();
    }
    let (nonce, ct) = buf.split_at(12);
    cipher
        .decrypt(Nonce::from_slice(nonce), ct)
        .ok()
        .and_then(|p| String::from_utf8(p).ok())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_and_plaintext_passthrough() {
        init("unit-test-key-0123456789");
        let enc = encrypt("my-channel-token");
        assert!(enc.starts_with(PREFIX));
        assert_ne!(encrypt("my-channel-token"), enc, "nonce ต้องสุ่มทุกครั้ง");
        assert_eq!(decrypt(&enc), "my-channel-token");
        assert_eq!(decrypt("legacy-plain"), "legacy-plain");
        assert_eq!(encrypt(""), "");
        assert_eq!(decrypt("enc:v1:broken"), "");
    }
}
