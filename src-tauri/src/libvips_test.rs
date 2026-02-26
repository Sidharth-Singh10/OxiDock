fn main() {
    let _app = libvips::VipsApp::new("test", false).unwrap();
    let buf = vec![0u8; 1024];
    let img = libvips::VipsImage::thumbnail_buffer(&buf, 256).unwrap();
    let webp_buf = libvips::ops::webpsave_buffer(&img).unwrap();
    println!("len: {}", webp_buf.len());
}
