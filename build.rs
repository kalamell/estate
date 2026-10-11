// ให้ sqlx::migrate! ฝังไฟล์ migration ใหม่ทุกครั้งที่มีการแก้ไข
fn main() {
    println!("cargo:rerun-if-changed=migrations");
}
