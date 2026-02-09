#!/usr/bin/env node
/**
 * Manual settings translations Part 2 - auto sleep and cloud settings
 */

const fs = require('fs');
const path = require('path');

const TRANSLATIONS_DIR = path.join(__dirname, '../src/i18n/translations');

const TRANSLATIONS = {
  "settings.auto_sleep.advanced_title": {
    ar: "⚙️ الإعدادات المتقدمة",
    de: "⚙️ Erweiterte Einstellungen",
    es: "⚙️ Configuración avanzada",
    fr: "⚙️ Paramètres avancés",
    hi: "⚙️ उन्नत सेटिंग्स",
    ja: "⚙️ 詳細設定",
    ko: "⚙️ 고급 설정",
    nl: "⚙️ Geavanceerde instellingen",
    pt: "⚙️ Configurações avançadas",
    sw: "⚙️ Mipangilio ya Juu",
    tr: "⚙️ Gelişmiş Ayarlar",
    zh: "⚙️ 高级设置"
  },
  "settings.auto_sleep.anytime_desc": {
    ar: "يكتشف النوم بناءً على سكون الهاتف فقط، في أي وقت من اليوم",
    de: "Erkennt Schlaf nur basierend auf Telefonstille, zu jeder Tageszeit",
    es: "Detecta el sueño basándose solo en la inactividad del teléfono, a cualquier hora del día",
    fr: "Détecte le sommeil uniquement en fonction de l'immobilité du téléphone, à tout moment de la journée",
    hi: "दिन के किसी भी समय, केवल फोन की स्थिरता के आधार पर नींद का पता लगाता है",
    ja: "一日中いつでも、電話の静止状態のみに基づいて睡眠を検出します",
    ko: "하루 중 언제든지 전화기 정지 상태만을 기반으로 수면을 감지합니다",
    nl: "Detecteert slaap puur op basis van telefoon stilstand, op elk moment van de dag",
    pt: "Detecta sono puramente com base na inatividade do telefone, a qualquer hora do dia",
    sw: "Inagundua usingizi kulingana na utulivu wa simu pekee, wakati wowote wa siku",
    tr: "Günün herhangi bir saatinde yalnızca telefon hareketsizliğine göre uyku tespit eder",
    zh: "纯粹根据手机静止状态检测睡眠，全天任何时间"
  },
  "settings.auto_sleep.anytime_title": {
    ar: "الكشف على مدار الساعة (وضع في أي وقت)",
    de: "24/7-Erkennung (Jederzeit-Modus)",
    es: "Detección 24/7 (Modo cualquier momento)",
    fr: "Détection 24/7 (Mode à tout moment)",
    hi: "24/7 डिटेक्शन (कभी भी मोड)",
    ja: "24時間検出（いつでもモード）",
    ko: "24시간 감지 (언제든지 모드)",
    nl: "24/7 Detectie (Altijd-modus)",
    pt: "Detecção 24/7 (Modo a qualquer hora)",
    sw: "Ugunduzaji wa 24/7 (Hali ya Wakati Wowote)",
    tr: "7/24 Algılama (Her Zaman Modu)",
    zh: "24/7检测（随时模式）"
  },
  "settings.auto_sleep.enable_desc": {
    ar: "اكتشاف وقت نومك تلقائياً",
    de: "Automatisch erkennen, wann du einschläfst",
    es: "Detectar automáticamente cuando te duermes",
    fr: "Détecter automatiquement quand vous vous endormez",
    hi: "स्वचालित रूप से पता लगाएं कि आप कब सो जाते हैं",
    ja: "眠りに落ちた時を自動的に検出",
    ko: "잠들 때를 자동으로 감지",
    nl: "Automatisch detecteren wanneer je in slaap valt",
    pt: "Detectar automaticamente quando você adormece",
    sw: "Gundua kiotomatiki unapolala",
    tr: "Uykuya daldığınızı otomatik olarak algıla",
    zh: "自动检测您何时入睡"
  },
  "settings.auto_sleep.enable_title": {
    ar: "تمكين الكشف التلقائي",
    de: "Auto-Erkennung aktivieren",
    es: "Habilitar detección automática",
    fr: "Activer la détection automatique",
    hi: "ऑटो डिटेक्शन सक्षम करें",
    ja: "自動検出を有効にする",
    ko: "자동 감지 활성화",
    nl: "Auto-detectie inschakelen",
    pt: "Ativar detecção automática",
    sw: "Wezesha Ugunduzaji Otomatiki",
    tr: "Otomatik Algılamayı Etkinleştir",
    zh: "启用自动检测"
  },
  "settings.auto_sleep.hours_value": {
    ar: "%{hours} ساعة",
    de: "%{hours} Stunden",
    es: "%{hours} horas",
    fr: "%{hours} heures",
    hi: "%{hours} घंटे",
    ja: "%{hours} 時間",
    ko: "%{hours} 시간",
    nl: "%{hours} uur",
    pt: "%{hours} horas",
    sw: "masaa %{hours}",
    tr: "%{hours} saat",
    zh: "%{hours} 小时"
  },
  "settings.auto_sleep.level_high": {
    ar: "عالي",
    de: "Hoch",
    es: "Alto",
    fr: "Élevé",
    hi: "उच्च",
    ja: "高",
    ko: "높음",
    nl: "Hoog",
    pt: "Alto",
    sw: "Juu",
    tr: "Yüksek",
    zh: "高"
  },
  "settings.auto_sleep.level_low": {
    ar: "منخفض",
    de: "Niedrig",
    es: "Bajo",
    fr: "Faible",
    hi: "निम्न",
    ja: "低",
    ko: "낮음",
    nl: "Laag",
    pt: "Baixo",
    sw: "Chini",
    tr: "Düşük",
    zh: "低"
  },
  "settings.auto_sleep.level_medium": {
    ar: "متوسط",
    de: "Mittel",
    es: "Medio",
    fr: "Moyen",
    hi: "मध्यम",
    ja: "中",
    ko: "중간",
    nl: "Gemiddeld",
    pt: "Médio",
    sw: "Kati",
    tr: "Orta",
    zh: "中"
  },
  "settings.auto_sleep.location_desc": {
    ar: "تحسين الدقة عن طريق الكشف عن حالة الداخل/الخارج",
    de: "Verbessere die Genauigkeit durch Erkennung des Innen-/Außenstatus",
    es: "Mejora la precisión detectando el estado interior/exterior",
    fr: "Améliorer la précision en détectant le statut intérieur/extérieur",
    hi: "इनडोर/आउटडोर स्थिति का पता लगाकर सटीकता में सुधार करें",
    ja: "屋内/屋外状態を検出して精度を向上",
    ko: "실내/실외 상태를 감지하여 정확도 향상",
    nl: "Verbeter nauwkeurigheid door binnen-/buitenstatus te detecteren",
    pt: "Melhore a precisão detectando o status interno/externo",
    sw: "Boresha usahihi kwa kugundua hali ya ndani/nje",
    tr: "İç/dış mekan durumunu algılayarak doğruluğu artırın",
    zh: "通过检测室内/室外状态提高准确性"
  },
  "settings.auto_sleep.location_title": {
    ar: "سياق الموقع",
    de: "Standortkontext",
    es: "Contexto de ubicación",
    fr: "Contexte de localisation",
    hi: "स्थान संदर्भ",
    ja: "位置情報コンテキスト",
    ko: "위치 컨텍스트",
    nl: "Locatiecontext",
    pt: "Contexto de localização",
    sw: "Muktadha wa Eneo",
    tr: "Konum Bağlamı",
    zh: "位置上下文"
  },
  "settings.auto_sleep.max_tracking": {
    ar: "⏰ أقصى تتبع",
    de: "⏰ Maximale Verfolgung",
    es: "⏰ Seguimiento máximo",
    fr: "⏰ Suivi maximum",
    hi: "⏰ अधिकतम ट्रैकिंग",
    ja: "⏰ 最大追跡時間",
    ko: "⏰ 최대 추적",
    nl: "⏰ Maximale tracking",
    pt: "⏰ Rastreamento máximo",
    sw: "⏰ Ufuatiliaji wa Juu",
    tr: "⏰ Maksimum Takip",
    zh: "⏰ 最大追踪"
  },
  "settings.auto_sleep.minutes_value": {
    ar: "%{minutes} دقيقة",
    de: "%{minutes} Minuten",
    es: "%{minutes} minutos",
    fr: "%{minutes} minutes",
    hi: "%{minutes} मिनट",
    ja: "%{minutes} 分",
    ko: "%{minutes} 분",
    nl: "%{minutes} minuten",
    pt: "%{minutes} minutos",
    sw: "dakika %{minutes}",
    tr: "%{minutes} dakika",
    zh: "%{minutes} 分钟"
  },
  "settings.auto_sleep.night_hours": {
    ar: "🌃 ساعات الليل",
    de: "🌃 Nachtstunden",
    es: "🌃 Horas nocturnas",
    fr: "🌃 Heures de nuit",
    hi: "🌃 रात के घंटे",
    ja: "🌃 夜間時間",
    ko: "🌃 야간 시간",
    nl: "🌃 Nachtelijke uren",
    pt: "🌃 Horas noturnas",
    sw: "🌃 Masaa ya Usiku",
    tr: "🌃 Gece Saatleri",
    zh: "🌃 夜间时间"
  },
  "settings.auto_sleep.night_hours_value": {
    ar: "%{start}:00 - %{end}:00",
    de: "%{start}:00 - %{end}:00",
    es: "%{start}:00 - %{end}:00",
    fr: "%{start}:00 - %{end}:00",
    hi: "%{start}:00 - %{end}:00",
    ja: "%{start}:00 - %{end}:00",
    ko: "%{start}:00 - %{end}:00",
    nl: "%{start}:00 - %{end}:00",
    pt: "%{start}:00 - %{end}:00",
    sw: "%{start}:00 - %{end}:00",
    tr: "%{start}:00 - %{end}:00",
    zh: "%{start}:00 - %{end}:00"
  },
  "settings.auto_sleep.only_charging": {
    ar: "فقط عند الشحن",
    de: "Nur beim Laden",
    es: "Solo cuando esté cargando",
    fr: "Uniquement en charge",
    hi: "केवल चार्ज होने पर",
    ja: "充電中のみ",
    ko: "충전 중일 때만",
    nl: "Alleen tijdens opladen",
    pt: "Apenas quando carregando",
    sw: "Wakati wa kuchaji tu",
    tr: "Yalnızca şarj olurken",
    zh: "仅充电时"
  },
  "settings.auto_sleep.section_subtitle": {
    ar: "الكشف التلقائي عند نومك",
    de: "Automatische Erkennung, wenn du schläfst",
    es: "Detección automática cuando duermes",
    fr: "Détection automatique quand vous dormez",
    hi: "जब आप सोते हैं तो स्वचालित पता लगाना",
    ja: "眠った時の自動検出",
    ko: "수면 시 자동 감지",
    nl: "Automatische detectie wanneer je slaapt",
    pt: "Detecção automática quando você dorme",
    sw: "Ugunduzaji otomatiki unapolala",
    tr: "Uyuduğunuzda otomatik algılama",
    zh: "睡眠时自动检测"
  },
  "settings.auto_sleep.section_title": {
    ar: "😴 تتبع النوم التلقائي",
    de: "😴 Automatisches Schlaftracking",
    es: "😴 Seguimiento automático del sueño",
    fr: "😴 Suivi automatique du sommeil",
    hi: "😴 ऑटो स्लीप ट्रैकिंग",
    ja: "😴 自動睡眠トラッキング",
    ko: "😴 자동 수면 추적",
    nl: "😴 Automatische Slaaptracking",
    pt: "😴 Rastreamento automático de sono",
    sw: "😴 Ufuatiliaji wa Usingizi Otomatiki",
    tr: "😴 Otomatik Uyku Takibi",
    zh: "😴 自动睡眠追踪"
  },
  "settings.auto_sleep.sensitivity_desc": {
    ar: "منخفض: 15 دقيقة سكون • متوسط: 10 دقائق • عالي: 5 دقائق",
    de: "Niedrig: 15 Min. Stille • Mittel: 10 Min. • Hoch: 5 Min.",
    es: "Bajo: 15 min quietud • Medio: 10 min • Alto: 5 min",
    fr: "Faible : 15 min d'immobilité • Moyen : 10 min • Élevé : 5 min",
    hi: "निम्न: 15 मिनट स्थिरता • मध्यम: 10 मिनट • उच्च: 5 मिनट",
    ja: "低：15分静止 • 中：10分 • 高：5分",
    ko: "낮음: 15분 정지 • 중간: 10분 • 높음: 5분",
    nl: "Laag: 15 min stilstand • Gemiddeld: 10 min • Hoog: 5 min",
    pt: "Baixo: 15 min parado • Médio: 10 min • Alto: 5 min",
    sw: "Chini: dakika 15 utulivu • Kati: dakika 10 • Juu: dakika 5",
    tr: "Düşük: 15 dk hareketsizlik • Orta: 10 dk • Yüksek: 5 dk",
    zh: "低：15分钟静止 • 中：10分钟 • 高：5分钟"
  },
  "settings.auto_sleep.sensitivity_title": {
    ar: "📊 حساسية الكشف",
    de: "📊 Erkennungsempfindlichkeit",
    es: "📊 Sensibilidad de detección",
    fr: "📊 Sensibilité de détection",
    hi: "📊 डिटेक्शन संवेदनशीलता",
    ja: "📊 検出感度",
    ko: "📊 감지 민감도",
    nl: "📊 Detectiegevoeligheid",
    pt: "📊 Sensibilidade de detecção",
    sw: "📊 Usikivu wa Ugunduzaji",
    tr: "📊 Algılama Hassasiyeti",
    zh: "📊 检测灵敏度"
  },
  "settings.auto_sleep.sleep_probe_snooze": {
    ar: "😴 تأجيل فحص النوم",
    de: "😴 Schlafprüfung zurückstellen",
    es: "😴 Posponer sondeo de sueño",
    fr: "😴 Reporter la sonde de sommeil",
    hi: "😴 स्लीप प्रोब स्नूज़",
    ja: "😴 睡眠プローブのスヌーズ",
    ko: "😴 수면 프로브 스누즈",
    nl: "😴 Slaaptest sluimeren",
    pt: "😴 Adiar sonda de sono",
    sw: "😴 Ahirisha Uchunguzi wa Usingizi",
    tr: "😴 Uyku Yoklaması Erteleme",
    zh: "😴 睡眠探测推迟"
  },
  "settings.auto_sleep.stillness_threshold": {
    ar: "⏱️ عتبة السكون",
    de: "⏱️ Stillstandsschwelle",
    es: "⏱️ Umbral de quietud",
    fr: "⏱️ Seuil d'immobilité",
    hi: "⏱️ स्थिरता सीमा",
    ja: "⏱️ 静止しきい値",
    ko: "⏱️ 정지 임계값",
    nl: "⏱️ Stilstanddrempel",
    pt: "⏱️ Limite de inatividade",
    sw: "⏱️ Kikomo cha Utulivu",
    tr: "⏱️ Hareketsizlik Eşiği",
    zh: "⏱️ 静止阈值"
  },
  "settings.auto_sleep.wake_snooze": {
    ar: "☀️ تأجيل الاستيقاظ",
    de: "☀️ Aufwachen zurückstellen",
    es: "☀️ Posponer despertar",
    fr: "☀️ Reporter le réveil",
    hi: "☀️ वेक स्नूज़",
    ja: "☀️ 起床スヌーズ",
    ko: "☀️ 기상 스누즈",
    nl: "☀️ Wakker worden sluimeren",
    pt: "☀️ Adiar despertar",
    sw: "☀️ Ahirisha Kuamka",
    tr: "☀️ Uyanma Erteleme",
    zh: "☀️ 起床推迟"
  },
  "settings.background_health_desc": {
    ar: "التحكم في الوضع والتشخيصات",
    de: "Modussteuerung und Diagnose",
    es: "Control de modo y diagnósticos",
    fr: "Contrôle du mode et diagnostics",
    hi: "मोड नियंत्रण और डायग्नोस्टिक्स",
    ja: "モード制御と診断",
    ko: "모드 제어 및 진단",
    nl: "Modusbesturing en diagnose",
    pt: "Controle de modo e diagnósticos",
    sw: "Udhibiti wa hali na uchunguzi",
    tr: "Mod kontrolü ve tanılama",
    zh: "模式控制和诊断"
  },
  "settings.background_health_title": {
    ar: "صحة الخلفية",
    de: "Hintergrundgesundheit",
    es: "Salud en segundo plano",
    fr: "Santé en arrière-plan",
    hi: "बैकग्राउंड हेल्थ",
    ja: "バックグラウンドヘルス",
    ko: "백그라운드 상태",
    nl: "Achtergrondgezondheid",
    pt: "Saúde em segundo plano",
    sw: "Afya ya Usuli",
    tr: "Arka Plan Sağlığı",
    zh: "后台健康"
  },
  "settings.clear_all_data_desc": {
    ar: "حذف جميع البيانات والخطط المحلية.",
    de: "Alle lokalen Daten und Pläne löschen.",
    es: "Eliminar todos los datos locales y planes.",
    fr: "Supprimer toutes les données locales et les plans.",
    hi: "सभी स्थानीय डेटा और प्लान हटाएं।",
    ja: "すべてのローカルデータとプランを削除します。",
    ko: "모든 로컬 데이터와 플랜을 삭제합니다.",
    nl: "Verwijder alle lokale gegevens en plannen.",
    pt: "Excluir todos os dados locais e planos.",
    sw: "Futa data zote za ndani na mipango.",
    tr: "Tüm yerel verileri ve planları sil.",
    zh: "删除所有本地数据和计划。"
  },
  "settings.cloud.backup_label": {
    ar: "النسخ الاحتياطي السحابي",
    de: "Cloud-Backup",
    es: "Copia de seguridad en la nube",
    fr: "Sauvegarde cloud",
    hi: "क्लाउड बैकअप",
    ja: "クラウドバックアップ",
    ko: "클라우드 백업",
    nl: "Cloudback-up",
    pt: "Backup na nuvem",
    sw: "Hifadhi ya Wingu",
    tr: "Bulut Yedekleme",
    zh: "云备份"
  },
  "settings.cloud.last_error": {
    ar: "آخر خطأ: %{error}",
    de: "Letzter Fehler: %{error}",
    es: "Último error: %{error}",
    fr: "Dernière erreur : %{error}",
    hi: "अंतिम त्रुटि: %{error}",
    ja: "最後のエラー: %{error}",
    ko: "마지막 오류: %{error}",
    nl: "Laatste fout: %{error}",
    pt: "Último erro: %{error}",
    sw: "Hitilafu ya mwisho: %{error}",
    tr: "Son hata: %{error}",
    zh: "最后错误：%{error}"
  },
  "settings.cloud.last_restore": {
    ar: "آخر استعادة: %{date}",
    de: "Letzte Wiederherstellung: %{date}",
    es: "Última restauración: %{date}",
    fr: "Dernière restauration : %{date}",
    hi: "अंतिम पुनर्स्थापना: %{date}",
    ja: "最後の復元: %{date}",
    ko: "마지막 복원: %{date}",
    nl: "Laatste herstel: %{date}",
    pt: "Última restauração: %{date}",
    sw: "Urejeshaji wa mwisho: %{date}",
    tr: "Son geri yükleme: %{date}",
    zh: "最后恢复：%{date}"
  },
  "settings.cloud.last_restore_error": {
    ar: "آخر خطأ استعادة: %{error}",
    de: "Letzter Wiederherstellungsfehler: %{error}",
    es: "Último error de restauración: %{error}",
    fr: "Dernière erreur de restauration : %{error}",
    hi: "अंतिम पुनर्स्थापना त्रुटि: %{error}",
    ja: "最後の復元エラー: %{error}",
    ko: "마지막 복원 오류: %{error}",
    nl: "Laatste herstelfout: %{error}",
    pt: "Último erro de restauração: %{error}",
    sw: "Hitilafu ya urejeshaji wa mwisho: %{error}",
    tr: "Son geri yükleme hatası: %{error}",
    zh: "最后恢复错误：%{error}"
  },
  "settings.cloud.last_sync": {
    ar: "آخر مزامنة: %{date}",
    de: "Letzte Synchronisierung: %{date}",
    es: "Última sincronización: %{date}",
    fr: "Dernière synchronisation : %{date}",
    hi: "अंतिम सिंक: %{date}",
    ja: "最後の同期: %{date}",
    ko: "마지막 동기화: %{date}",
    nl: "Laatste synchronisatie: %{date}",
    pt: "Última sincronização: %{date}",
    sw: "Usawazishaji wa mwisho: %{date}",
    tr: "Son senkronizasyon: %{date}",
    zh: "最后同步：%{date}"
  },
  "settings.cloud.not_synced": {
    ar: "لم تتم المزامنة بعد",
    de: "Noch nicht synchronisiert",
    es: "No sincronizado aún",
    fr: "Pas encore synchronisé",
    hi: "अभी तक सिंक नहीं हुआ",
    ja: "まだ同期されていません",
    ko: "아직 동기화되지 않음",
    nl: "Nog niet gesynchroniseerd",
    pt: "Ainda não sincronizado",
    sw: "Bado haijasawazishwa",
    tr: "Henüz senkronize edilmedi",
    zh: "尚未同步"
  },
  "settings.cloud.permission_denied": {
    ar: "تم حظر المزامنة السحابية بواسطة أذونات Firestore. تحقق من قواعد Firebase وتسجيل الدخول.",
    de: "Cloud-Synchronisierung wird durch Firestore-Berechtigungen blockiert. Überprüfe deine Firebase-Regeln und Anmeldung.",
    es: "La sincronización en la nube está bloqueada por los permisos de Firestore. Verifica tus reglas de Firebase e inicio de sesión.",
    fr: "La synchronisation cloud est bloquée par les autorisations Firestore. Vérifiez vos règles Firebase et votre connexion.",
    hi: "क्लाउड सिंक Firestore अनुमतियों द्वारा अवरुद्ध है। अपने Firebase नियम और साइन-इन की जाँच करें।",
    ja: "クラウド同期はFirestoreの権限によりブロックされています。Firebaseのルールとサインインを確認してください。",
    ko: "클라우드 동기화가 Firestore 권한에 의해 차단되었습니다. Firebase 규칙과 로그인을 확인하세요.",
    nl: "Cloud-sync wordt geblokkeerd door Firestore-machtigingen. Controleer je Firebase-regels en aanmelding.",
    pt: "A sincronização na nuvem está bloqueada pelas permissões do Firestore. Verifique suas regras do Firebase e login.",
    sw: "Usawazishaji wa wingu umezuiwa na ruhusa za Firestore. Angalia sheria zako za Firebase na uingie.",
    tr: "Bulut senkronizasyonu Firestore izinleri tarafından engellendi. Firebase kurallarınızı ve girişinizi kontrol edin.",
    zh: "云同步被 Firestore 权限阻止。请检查您的 Firebase 规则和登录。"
  },
  "settings.cloud.restore_action": {
    ar: "استعادة",
    de: "Wiederherstellen",
    es: "Restaurar",
    fr: "Restaurer",
    hi: "पुनर्स्थापित करें",
    ja: "復元",
    ko: "복원",
    nl: "Herstellen",
    pt: "Restaurar",
    sw: "Rejesha",
    tr: "Geri Yükle",
    zh: "恢复"
  },
  "settings.cloud.restore_confirm_body": {
    ar: "سيؤدي هذا إلى دمج النسخة الاحتياطية السحابية في هذا الجهاز. ستبقى بياناتك الحالية ما لم تكن هناك بيانات سحابية أحدث.",
    de: "Dies führt deine Cloud-Sicherung in dieses Gerät zusammen. Deine aktuellen Daten bleiben erhalten, es sei denn, es gibt neuere Cloud-Daten.",
    es: "Esto fusionará tu copia de seguridad en la nube en este dispositivo. Tus datos actuales permanecerán a menos que haya datos en la nube más recientes.",
    fr: "Cela fusionnera votre sauvegarde cloud dans cet appareil. Vos données actuelles resteront sauf s'il y a des données cloud plus récentes.",
    hi: "यह आपके क्लाउड बैकअप को इस डिवाइस में मर्ज करेगा। जब तक नए क्लाउड डेटा न हो, आपका वर्तमान डेटा रहेगा।",
    ja: "これにより、クラウドバックアップがこのデバイスにマージされます。新しいクラウドデータがない限り、現在のデータは保持されます。",
    ko: "이렇게 하면 클라우드 백업이 이 기기에 병합됩니다. 더 새로운 클라우드 데이터가 없는 한 현재 데이터는 유지됩니다.",
    nl: "Dit zal je cloud-backup in dit apparaat samenvoegen. Je huidige gegevens blijven behouden tenzij er nieuwere cloudgegevens zijn.",
    pt: "Isso mesclará seu backup na nuvem neste dispositivo. Seus dados atuais permanecerão, a menos que haja dados na nuvem mais recentes.",
    sw: "Hii itachanganya hifadhi yako ya wingu kwenye kifaa hiki. Data yako ya sasa itabaki isipokuwa kuna data mpya ya wingu.",
    tr: "Bu, bulut yedeğinizi bu cihazla birleştirecektir. Daha yeni bulut verileri olmadıkça mevcut verileriniz kalacaktır.",
    zh: "这会将您的云备份合并到此设备。除非有更新的云数据，否则您当前的数据将保留。"
  },
  "settings.cloud.restore_confirm_title": {
    ar: "استعادة من السحابة؟",
    de: "Aus Cloud wiederherstellen?",
    es: "¿Restaurar desde la nube?",
    fr: "Restaurer depuis le cloud ?",
    hi: "क्लाउड से पुनर्स्थापित करें?",
    ja: "クラウドから復元しますか？",
    ko: "클라우드에서 복원하시겠습니까?",
    nl: "Herstellen vanuit cloud?",
    pt: "Restaurar da nuvem?",
    sw: "Rejesha kutoka Wingu?",
    tr: "Buluttan geri yüklensin mi?",
    zh: "从云端恢复？"
  },
  "settings.cloud.restore_desc": {
    ar: "استعادة من السحابة (دمج أو استبدال البيانات المحلية)",
    de: "Aus Cloud wiederherstellen (lokale Daten zusammenführen oder ersetzen)",
    es: "Restaurar desde la nube (fusionar o reemplazar datos locales)",
    fr: "Restaurer depuis le cloud (fusionner ou remplacer les données locales)",
    hi: "क्लाउड से पुनर्स्थापित करें (स्थानीय डेटा मर्ज या बदलें)",
    ja: "クラウドから復元（ローカルデータをマージまたは置換）",
    ko: "클라우드에서 복원 (로컬 데이터 병합 또는 교체)",
    nl: "Herstellen vanuit cloud (lokale gegevens samenvoegen of vervangen)",
    pt: "Restaurar da nuvem (mesclar ou substituir dados locais)",
    sw: "Rejesha kutoka wingu (changanya au badilisha data za ndani)",
    tr: "Buluttan geri yükle (yerel verileri birleştir veya değiştir)",
    zh: "从云端恢复（合并或替换本地数据）"
  },
  "settings.cloud.restore_failed_body": {
    ar: "تعذر استعادة البيانات من النسخة الاحتياطية السحابية.",
    de: "Daten konnten nicht aus dem Cloud-Backup wiederhergestellt werden.",
    es: "No se pudieron restaurar los datos de la copia de seguridad en la nube.",
    fr: "Impossible de restaurer les données depuis la sauvegarde cloud.",
    hi: "क्लाउड बैकअप से डेटा पुनर्स्थापित करने में असमर्थ।",
    ja: "クラウドバックアップからデータを復元できません。",
    ko: "클라우드 백업에서 데이터를 복원할 수 없습니다.",
    nl: "Kan gegevens niet herstellen vanuit cloud-backup.",
    pt: "Não foi possível restaurar dados do backup na nuvem.",
    sw: "Imeshindwa kurejesha data kutoka hifadhi ya wingu.",
    tr: "Bulut yedeğinden veriler geri yüklenemedi.",
    zh: "无法从云备份恢复数据。"
  },
  "settings.cloud.restore_failed_title": {
    ar: "فشلت استعادة السحابة",
    de: "Cloud-Wiederherstellung fehlgeschlagen",
    es: "Error en restauración de la nube",
    fr: "Échec de la restauration cloud",
    hi: "क्लाउड पुनर्स्थापना विफल",
    ja: "クラウド復元に失敗しました",
    ko: "클라우드 복원 실패",
    nl: "Cloud-herstel mislukt",
    pt: "Falha na restauração da nuvem",
    sw: "Urejeshaji wa Wingu Umeshindikana",
    tr: "Bulut Geri Yükleme Başarısız",
    zh: "云恢复失败"
  },
  "settings.cloud.restore_label": {
    ar: "استعادة النسخة الاحتياطية",
    de: "Backup wiederherstellen",
    es: "Restaurar copia de seguridad",
    fr: "Restaurer la sauvegarde",
    hi: "बैकअप पुनर्स्थापित करें",
    ja: "バックアップを復元",
    ko: "백업 복원",
    nl: "Back-up herstellen",
    pt: "Restaurar backup",
    sw: "Rejesha Hifadhi",
    tr: "Yedeği Geri Yükle",
    zh: "恢复备份"
  },
  "settings.cloud.restore_merge": {
    ar: "دمج (موصى به)",
    de: "Zusammenführen (empfohlen)",
    es: "Fusionar (recomendado)",
    fr: "Fusionner (recommandé)",
    hi: "मर्ज करें (अनुशंसित)",
    ja: "マージ（推奨）",
    ko: "병합 (권장)",
    nl: "Samenvoegen (aanbevolen)",
    pt: "Mesclar (recomendado)",
    sw: "Changanya (inashauriwa)",
    tr: "Birleştir (önerilen)",
    zh: "合并（推荐）"
  },
  "settings.cloud.restore_prompt_body": {
    ar: "الدمج يحافظ على بياناتك المحلية ويضيف البيانات السحابية. الاستبدال يحل محل البيانات المحلية.",
    de: "Zusammenführen behält deine lokalen Daten und fügt Cloud-Daten hinzu. Ersetzen überschreibt lokale Daten.",
    es: "Fusionar mantiene tus datos locales y agrega datos de la nube. Reemplazar sobrescribe los datos locales.",
    fr: "Fusionner conserve vos données locales et ajoute les données cloud. Remplacer écrase les données locales.",
    hi: "मर्ज आपके स्थानीय डेटा को रखता है और क्लाउड डेटा जोड़ता है। बदलें स्थानीय डेटा को ओवरराइट करता है।",
    ja: "マージはローカルデータを保持し、クラウドデータを追加します。置換はローカルデータを上書きします。",
    ko: "병합은 로컬 데이터를 유지하고 클라우드 데이터를 추가합니다. 교체는 로컬 데이터를 덮어씁니다.",
    nl: "Samenvoegen behoudt je lokale gegevens en voegt cloudgegevens toe. Vervangen overschrijft lokale gegevens.",
    pt: "Mesclar mantém seus dados locais e adiciona dados da nuvem. Substituir sobrescreve os dados locais.",
    sw: "Kuchanganya kunaweka data yako ya ndani na kuongeza data ya wingu. Kubadilisha kunafuta data ya ndani.",
    tr: "Birleştir yerel verilerinizi korur ve bulut verilerini ekler. Değiştir yerel verilerin üzerine yazar.",
    zh: "合并保留您的本地数据并添加云数据。替换会覆盖本地数据。"
  },
  "settings.cloud.restore_prompt_title": {
    ar: "استعادة النسخة الاحتياطية السحابية",
    de: "Cloud-Backup wiederherstellen",
    es: "Restaurar copia de seguridad en la nube",
    fr: "Restaurer la sauvegarde cloud",
    hi: "क्लाउड बैकअप पुनर्स्थापित करें",
    ja: "クラウドバックアップを復元",
    ko: "클라우드 백업 복원",
    nl: "Cloud-backup herstellen",
    pt: "Restaurar backup na nuvem",
    sw: "Rejesha Hifadhi ya Wingu",
    tr: "Bulut Yedeğini Geri Yükle",
    zh: "恢复云备份"
  },
  "settings.cloud.restore_replace": {
    ar: "استبدال المحلي",
    de: "Lokal ersetzen",
    es: "Reemplazar local",
    fr: "Remplacer local",
    hi: "स्थानीय बदलें",
    ja: "ローカルを置換",
    ko: "로컬 교체",
    nl: "Lokaal vervangen",
    pt: "Substituir local",
    sw: "Badilisha ya ndani",
    tr: "Yereli değiştir",
    zh: "替换本地"
  },
  "settings.cloud.restore_result_body": {
    ar: "تم استعادة %{plans} خطة، %{wrapups} ملخص، %{logs} سجل.",
    de: "%{plans} Pläne, %{wrapups} Zusammenfassungen, %{logs} Protokolle wiederhergestellt.",
    es: "Se restauraron %{plans} planes, %{wrapups} resúmenes, %{logs} registros.",
    fr: "Restauré %{plans} plans, %{wrapups} bilans, %{logs} journaux.",
    hi: "%{plans} प्लान, %{wrapups} रैप-अप, %{logs} लॉग पुनर्स्थापित किए गए।",
    ja: "%{plans}プラン、%{wrapups}まとめ、%{logs}ログを復元しました。",
    ko: "%{plans}개 플랜, %{wrapups}개 마무리, %{logs}개 로그를 복원했습니다.",
    nl: "%{plans} plannen, %{wrapups} afsluitingen, %{logs} logboeken hersteld.",
    pt: "Restaurados %{plans} planos, %{wrapups} resumos, %{logs} registros.",
    sw: "Imerejeshwa mipango %{plans}, muhtasari %{wrapups}, rekodi %{logs}.",
    tr: "%{plans} plan, %{wrapups} özet, %{logs} kayıt geri yüklendi.",
    zh: "已恢复 %{plans} 个计划、%{wrapups} 个总结、%{logs} 条记录。"
  },
  "settings.cloud.restore_result_title": {
    ar: "استعادة السحابة",
    de: "Cloud-Wiederherstellung",
    es: "Restauración de la nube",
    fr: "Restauration cloud",
    hi: "क्लाउड पुनर्स्थापना",
    ja: "クラウド復元",
    ko: "클라우드 복원",
    nl: "Cloud-herstel",
    pt: "Restauração da nuvem",
    sw: "Urejeshaji wa Wingu",
    tr: "Bulut Geri Yükleme",
    zh: "云恢复"
  },
  "settings.cloud.restoring": {
    ar: "جارٍ الاستعادة...",
    de: "Wiederherstellen...",
    es: "Restaurando...",
    fr: "Restauration...",
    hi: "पुनर्स्थापित हो रहा है...",
    ja: "復元中...",
    ko: "복원 중...",
    nl: "Herstellen...",
    pt: "Restaurando...",
    sw: "Inarejesha...",
    tr: "Geri yükleniyor...",
    zh: "恢复中..."
  },
  "settings.cloud.sync_failed_body": {
    ar: "يرجى المحاولة مرة أخرى عند العودة للإنترنت.",
    de: "Bitte erneut versuchen, wenn du wieder online bist.",
    es: "Por favor, inténtalo de nuevo cuando estés en línea.",
    fr: "Veuillez réessayer lorsque vous serez de retour en ligne.",
    hi: "कृपया ऑनलाइन वापस आने पर पुनः प्रयास करें।",
    ja: "オンラインに戻ったらもう一度お試しください。",
    ko: "온라인으로 돌아오면 다시 시도해 주세요.",
    nl: "Probeer het opnieuw wanneer je weer online bent.",
    pt: "Por favor, tente novamente quando estiver online.",
    sw: "Tafadhali jaribu tena utakaporudi mtandaoni.",
    tr: "Lütfen tekrar çevrimiçi olduğunuzda tekrar deneyin.",
    zh: "请在重新联网后重试。"
  },
  "settings.cloud.sync_failed_title": {
    ar: "فشلت المزامنة السحابية",
    de: "Cloud-Synchronisierung fehlgeschlagen",
    es: "Error en sincronización de la nube",
    fr: "Échec de la synchronisation cloud",
    hi: "क्लाउड सिंक विफल",
    ja: "クラウド同期に失敗しました",
    ko: "클라우드 동기화 실패",
    nl: "Cloud-synchronisatie mislukt",
    pt: "Falha na sincronização da nuvem",
    sw: "Usawazishaji wa Wingu Umeshindikana",
    tr: "Bulut Senkronizasyonu Başarısız",
    zh: "云同步失败"
  },
  "settings.cloud.sync_now": {
    ar: "مزامنة الآن",
    de: "Jetzt synchronisieren",
    es: "Sincronizar ahora",
    fr: "Synchroniser maintenant",
    hi: "अभी सिंक करें",
    ja: "今すぐ同期",
    ko: "지금 동기화",
    nl: "Nu synchroniseren",
    pt: "Sincronizar agora",
    sw: "Sawazisha sasa",
    tr: "Şimdi senkronize et",
    zh: "立即同步"
  },
  "settings.cloud.sync_success_body": {
    ar: "تم نسخ بياناتك احتياطياً بنجاح.",
    de: "Deine Daten wurden erfolgreich gesichert.",
    es: "Tus datos fueron respaldados exitosamente.",
    fr: "Vos données ont été sauvegardées avec succès.",
    hi: "आपके डेटा का सफलतापूर्वक बैकअप लिया गया।",
    ja: "データは正常にバックアップされました。",
    ko: "데이터가 성공적으로 백업되었습니다.",
    nl: "Je gegevens zijn succesvol geback-upt.",
    pt: "Seus dados foram copiados com sucesso.",
    sw: "Data yako imehifadhiwa kwa mafanikio.",
    tr: "Verileriniz başarıyla yedeklendi.",
    zh: "您的数据已成功备份。"
  },
  "settings.cloud.sync_title": {
    ar: "المزامنة السحابية",
    de: "Cloud-Synchronisierung",
    es: "Sincronización en la nube",
    fr: "Synchronisation cloud",
    hi: "क्लाउड सिंक",
    ja: "クラウド同期",
    ko: "클라우드 동기화",
    nl: "Cloud-synchronisatie",
    pt: "Sincronização na nuvem",
    sw: "Usawazishaji wa Wingu",
    tr: "Bulut Senkronizasyonu",
    zh: "云同步"
  },
  "settings.cloud.syncing": {
    ar: "جارٍ المزامنة...",
    de: "Synchronisiere...",
    es: "Sincronizando...",
    fr: "Synchronisation...",
    hi: "सिंक हो रहा है...",
    ja: "同期中...",
    ko: "동기화 중...",
    nl: "Synchroniseren...",
    pt: "Sincronizando...",
    sw: "Inasawazisha...",
    tr: "Senkronize ediliyor...",
    zh: "同步中..."
  }
};

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

const writeJsonSorted = (filePath, obj) => {
  const sorted = {};
  Object.keys(obj).sort().forEach((key) => {
    sorted[key] = obj[key];
  });
  fs.writeFileSync(filePath, JSON.stringify(sorted, null, 2) + '\n', 'utf8');
};

const main = () => {
  const enPath = path.join(TRANSLATIONS_DIR, 'en.json');
  const en = readJson(enPath);

  const langs = ['ar', 'de', 'es', 'fr', 'hi', 'ja', 'ko', 'nl', 'pt', 'sw', 'tr', 'zh'];

  for (const lang of langs) {
    const filePath = path.join(TRANSLATIONS_DIR, `${lang}.json`);
    if (!fs.existsSync(filePath)) continue;

    const translations = readJson(filePath);
    let updated = 0;

    for (const [key, langTranslations] of Object.entries(TRANSLATIONS)) {
      if (langTranslations[lang] && translations[key] === en[key]) {
        translations[key] = langTranslations[lang];
        updated++;
      }
    }

    writeJsonSorted(filePath, translations);
    console.log(`[settings-2] ${lang}: ${updated} keys updated`);
  }

  console.log('[settings-2] Part 2 complete');
};

main();
