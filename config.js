// ═══════════════════════════════════════════════════════════════
// PARFUMKU POS v5.0 — Configuration
// ═══════════════════════════════════════════════════════════════
// ⚠️ File ini berisi kredensial. Jangan commit ke Git public.
// Cara pakai: letakkan satu folder dengan index.html

window.PARFUMKU_CONFIG = {

  // ═══ WAJIB DIISI ═══
  // Dapatkan dari: Supabase Dashboard → Settings → API
  supabaseUrl:     'https://ekzzgbuwqhfifrmkkahj.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVrenpnYnV3cWhmaWZybWtrYWhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwOTE5NjQsImV4cCI6MjEwNzY2Nzk2NH0.teuIXTviBEou3eVHhsQlO3acRLeibfVko6vIT0i0Yc4',

  // ═══ OPSIONAL (default sudah oke) ═══
  appName:              'Parfumku POS',
  appVersion:           '5.0.0',
  debugMode:            false,      // true = log semua query ke console
  offlineQueueEnabled:  true,       // queue transaksi saat internet mati
  syncIntervalMs:       30000,      // retry queue tiap 30 detik
  realtimeTables:       ['produk', 'transaksi', 'pending_orders'],
  maxFotoSizeMB:        0.15,       // ukuran foto setelah kompres
  storageBucket:        'photos',
};

// ═══ Validasi otomatis ═══
(function() {
  const cfg = window.PARFUMKU_CONFIG;
  const isPlaceholder = !cfg.supabaseUrl ||
                        cfg.supabaseUrl.includes('GANTI') ||
                        !cfg.supabaseAnonKey ||
                        cfg.supabaseAnonKey.includes('GANTI');

  if (isPlaceholder) {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => {
        alert(
          '⚠️ KONFIGURASI BELUM DIISI\n\n' +
          'Buka file config.js dan isi 2 baris ini:\n\n' +
          '  supabaseUrl:     "https://xxx.supabase.co"\n' +
          '  supabaseAnonKey: "eyJhbGci..."\n\n' +
          'Dapatkan dari:\n' +
          'Supabase → Settings → API'
        );
      }, 100);
    });
  } else if (cfg.debugMode) {
    console.log('✅ Config loaded:', {
      url: cfg.supabaseUrl,
      keyPreview: cfg.supabaseAnonKey.slice(0, 20) + '...'
    });
  }
})();