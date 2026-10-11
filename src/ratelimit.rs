//! จำกัดจำนวนคำขอแบบหน้าต่างเวลาคงที่ (ในหน่วยความจำ) — กันเดารหัสผ่านและสแปมหน้าสาธารณะ

use std::{
    collections::HashMap,
    sync::Mutex,
    time::{Duration, Instant},
};

use crate::error::{AppError, AppResult};

#[derive(Default)]
pub struct RateLimiter {
    buckets: Mutex<HashMap<String, (u32, Instant)>>,
}

impl RateLimiter {
    /// อนุญาตไม่เกิน `limit` ครั้งต่อ `window` สำหรับ `key`
    pub fn check(&self, key: &str, limit: u32, window: Duration) -> AppResult<()> {
        let now = Instant::now();
        let mut map = self.buckets.lock().expect("rate limiter lock");
        if map.len() > 50_000 {
            map.retain(|_, (_, start)| now.duration_since(*start) < Duration::from_secs(3600));
        }
        let entry = map.entry(key.to_string()).or_insert((0, now));
        if now.duration_since(entry.1) >= window {
            *entry = (0, now);
        }
        entry.0 += 1;
        if entry.0 > limit {
            return Err(AppError::TooManyRequests);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blocks_after_limit() {
        let rl = RateLimiter::default();
        for _ in 0..3 {
            rl.check("ip:1", 3, Duration::from_secs(60)).unwrap();
        }
        assert!(rl.check("ip:1", 3, Duration::from_secs(60)).is_err());
        assert!(rl.check("ip:2", 3, Duration::from_secs(60)).is_ok());
    }
}
