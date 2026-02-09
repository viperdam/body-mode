#!/usr/bin/env node

/**
 * Complete Translation Script for ALL i18n keys
 *
 * This script translates all English strings to all 12 target languages.
 * Translations are provided inline for accuracy.
 */

const fs = require('fs');
const path = require('path');

const TRANSLATIONS_DIR = path.join(__dirname, '../src/i18n/translations');

// Complete translations for ALL keys
// Organized by key prefix for manageability

const TRANSLATIONS = {
  // =============================================
  // ACCOUNT & AUTH
  // =============================================
  "account": {
    ar: "الحساب", de: "Konto", es: "Cuenta", fr: "Compte", hi: "खाता",
    ja: "アカウント", ko: "계정", nl: "Account", pt: "Conta", sw: "Akaunti", tr: "Hesap", zh: "账户"
  },
  "about": {
    ar: "حول", de: "Über", es: "Acerca de", fr: "À propos", hi: "के बारे में",
    ja: "について", ko: "정보", nl: "Over", pt: "Sobre", sw: "Kuhusu", tr: "Hakkında", zh: "关于"
  },
  "activities": {
    ar: "الأنشطة", de: "Aktivitäten", es: "Actividades", fr: "Activités", hi: "गतिविधियाँ",
    ja: "アクティビティ", ko: "활동", nl: "Activiteiten", pt: "Atividades", sw: "Shughuli", tr: "Aktiviteler", zh: "活动"
  },
  "activity_subtitle": {
    ar: "ما مقدار حركتك؟", de: "Wie viel bewegst du dich?", es: "¿Cuánto te mueves?", fr: "Combien bougez-vous?", hi: "आप कितना चलते हैं?",
    ja: "どのくらい動きますか？", ko: "얼마나 움직이시나요?", nl: "Hoeveel beweeg je?", pt: "Quanto você se move?", sw: "Unaendeaje?", tr: "Ne kadar hareket ediyorsun?", zh: "你运动多少？"
  },
  "activity_title": {
    ar: "النشاط", de: "Aktivität", es: "Actividad", fr: "Activité", hi: "गतिविधि",
    ja: "アクティビティ", ko: "활동", nl: "Activiteit", pt: "Atividade", sw: "Shughuli", tr: "Aktivite", zh: "活动"
  },
  "add_item_placeholder": {
    ar: "مثال: + 1 موزة", de: "z.B. + 1 Banane", es: "ej. + 1 Plátano", fr: "ex. + 1 Banane", hi: "उदा. + 1 केला",
    ja: "例：+ バナナ1本", ko: "예: + 바나나 1개", nl: "bijv. + 1 Banaan", pt: "ex. + 1 Banana", sw: "mfano + 1 Ndizi", tr: "örn. + 1 Muz", zh: "例如：+ 1 香蕉"
  },
  "add_side": {
    ar: "إضافة طبق جانبي", de: "Beilage hinzufügen", es: "Añadir acompañamiento", fr: "Ajouter un accompagnement", hi: "साइड आइटम जोड़ें",
    ja: "サイドメニューを追加", ko: "사이드 추가", nl: "Bijgerecht toevoegen", pt: "Adicionar acompanhamento", sw: "Ongeza kitu cha ziada", tr: "Yan yemek ekle", zh: "添加配菜"
  },
  "analyzing": {
    ar: "جارٍ التحليل...", de: "Analysiere...", es: "Analizando...", fr: "Analyse en cours...", hi: "विश्लेषण हो रहा है...",
    ja: "分析中...", ko: "분석 중...", nl: "Analyseren...", pt: "Analisando...", sw: "Inachambua...", tr: "Analiz ediliyor...", zh: "分析中..."
  },
  "analyzing_fridge": {
    ar: "جارٍ اكتشاف المكونات...", de: "Zutaten erkennen...", es: "Detectando ingredientes...", fr: "Détection des ingrédients...", hi: "सामग्री पता लगाई जा रही है...",
    ja: "食材を検出中...", ko: "재료 감지 중...", nl: "Ingrediënten detecteren...", pt: "Detectando ingredientes...", sw: "Inagundua viungo...", tr: "Malzemeler tespit ediliyor...", zh: "检测食材中..."
  },
  "appearance": {
    ar: "المظهر", de: "Erscheinungsbild", es: "Apariencia", fr: "Apparence", hi: "दिखावट",
    ja: "外観", ko: "외관", nl: "Uiterlijk", pt: "Aparência", sw: "Muonekano", tr: "Görünüm", zh: "外观"
  },
  "backup": {
    ar: "نسخ البيانات احتياطياً", de: "Daten sichern", es: "Copia de seguridad", fr: "Sauvegarder les données", hi: "डेटा बैकअप",
    ja: "データをバックアップ", ko: "데이터 백업", nl: "Gegevens back-uppen", pt: "Backup de dados", sw: "Hifadhi data", tr: "Veri yedekle", zh: "备份数据"
  },
  "basics": {
    ar: "الأساسيات", de: "Grundlagen", es: "Básicos", fr: "Les bases", hi: "मूल बातें",
    ja: "基本情報", ko: "기본 정보", nl: "Basis", pt: "Básico", sw: "Msingi", tr: "Temel bilgiler", zh: "基本信息"
  },
  "basics_subtitle": {
    ar: "لمن نصمم؟", de: "Für wen designen wir?", es: "¿Para quién diseñamos?", fr: "Pour qui concevons-nous?", hi: "हम किसके लिए डिज़ाइन कर रहे हैं?",
    ja: "誰のためにデザインしますか？", ko: "누구를 위해 디자인하나요?", nl: "Voor wie ontwerpen we?", pt: "Para quem estamos projetando?", sw: "Tunabuni kwa nani?", tr: "Kimin için tasarlıyoruz?", zh: "我们为谁设计？"
  },
  "basics_title": {
    ar: "الأساسيات", de: "Die Grundlagen", es: "Lo básico", fr: "Les bases", hi: "मूल बातें",
    ja: "基本情報", ko: "기본 정보", nl: "De basis", pt: "O básico", sw: "Msingi", tr: "Temel bilgiler", zh: "基本信息"
  },
  "build_muscle": {
    ar: "بناء العضلات", de: "Muskeln aufbauen", es: "Ganar músculo", fr: "Développer les muscles", hi: "मांसपेशियां बनाएं",
    ja: "筋肉をつける", ko: "근육 만들기", nl: "Spieren opbouwen", pt: "Ganhar músculo", sw: "Jenga misuli", tr: "Kas yap", zh: "增肌"
  },
  "cal": {
    ar: "سعرة", de: "kcal", es: "cal", fr: "cal", hi: "कैल",
    ja: "カロリー", ko: "칼로리", nl: "cal", pt: "cal", sw: "kalori", tr: "kal", zh: "卡"
  },
  "calories_left": {
    ar: "السعرات المتبقية", de: "Verbleibende Kalorien", es: "Calorías restantes", fr: "Calories restantes", hi: "बची हुई कैलोरी",
    ja: "残りカロリー", ko: "남은 칼로리", nl: "Resterende calorieën", pt: "Calorias restantes", sw: "Kalori zilizobaki", tr: "Kalan kalori", zh: "剩余卡路里"
  },
  "camera": {
    ar: "الكاميرا", de: "Kamera", es: "Cámara", fr: "Caméra", hi: "कैमरा",
    ja: "カメラ", ko: "카메라", nl: "Camera", pt: "Câmera", sw: "Kamera", tr: "Kamera", zh: "相机"
  },
  "cancel": {
    ar: "إلغاء", de: "Abbrechen", es: "Cancelar", fr: "Annuler", hi: "रद्द करें",
    ja: "キャンセル", ko: "취소", nl: "Annuleren", pt: "Cancelar", sw: "Ghairi", tr: "İptal", zh: "取消"
  },
  "chef_thinking": {
    ar: "الشيف الذكي يحضر الأفكار...", de: "Chef Gemini überlegt...", es: "El Chef Gemini está cocinando ideas...", fr: "Le Chef Gemini prépare des idées...", hi: "शेफ जेमिनी विचार बना रहा है...",
    ja: "シェフGeminiがアイデアを考え中...", ko: "셰프 Gemini가 아이디어를 만들고 있어요...", nl: "Chef Gemini bedenkt ideeën...", pt: "Chef Gemini está pensando em ideias...", sw: "Chef Gemini anaandaa mawazo...", tr: "Şef Gemini fikirler üretiyor...", zh: "Gemini大厨正在构思..."
  },
  "chronic_conditions": {
    ar: "الحالات المزمنة", de: "Chronische Erkrankungen", es: "Condiciones crónicas", fr: "Conditions chroniques", hi: "पुरानी स्थितियां",
    ja: "慢性疾患", ko: "만성 질환", nl: "Chronische aandoeningen", pt: "Condições crônicas", sw: "Hali za kudumu", tr: "Kronik rahatsızlıklar", zh: "慢性病"
  },
  "conditions_injuries": {
    ar: "الحالات / الإصابات", de: "Erkrankungen / Verletzungen", es: "Condiciones / Lesiones", fr: "Conditions / Blessures", hi: "स्थितियां / चोटें",
    ja: "疾患 / 怪我", ko: "질환 / 부상", nl: "Aandoeningen / Blessures", pt: "Condições / Lesões", sw: "Hali / Majeraha", tr: "Durumlar / Yaralanmalar", zh: "疾病 / 伤病"
  },
  "consumed": {
    ar: "مستهلك", de: "Verbraucht", es: "Consumido", fr: "Consommé", hi: "खाया गया",
    ja: "摂取済み", ko: "섭취함", nl: "Geconsumeerd", pt: "Consumido", sw: "Imeliwa", tr: "Tüketilen", zh: "已摄入"
  },
  "continue": {
    ar: "متابعة", de: "Weiter", es: "Continuar", fr: "Continuer", hi: "जारी रखें",
    ja: "続ける", ko: "계속", nl: "Doorgaan", pt: "Continuar", sw: "Endelea", tr: "Devam", zh: "继续"
  },
  "cooking_mood": {
    ar: "مزاج الطبخ", de: "Kochlaune", es: "Ánimo para cocinar", fr: "Humeur cuisine", hi: "खाना पकाने का मूड",
    ja: "料理の気分", ko: "요리 기분", nl: "Kookstemming", pt: "Humor para cozinhar", sw: "Hali ya kupika", tr: "Yemek yapma havası", zh: "烹饪心情"
  },
  "current_status": {
    ar: "الحالة الحالية", de: "Aktueller Status", es: "Estado actual", fr: "Statut actuel", hi: "वर्तमान स्थिति",
    ja: "現在の状態", ko: "현재 상태", nl: "Huidige status", pt: "Status atual", sw: "Hali ya sasa", tr: "Mevcut durum", zh: "当前状态"
  },
  "custom_amount": {
    ar: "كمية مخصصة (مل)", de: "Benutzerdefinierte Menge (ml)", es: "Cantidad personalizada (ml)", fr: "Quantité personnalisée (ml)", hi: "कस्टम मात्रा (मिली)",
    ja: "カスタム量 (ml)", ko: "사용자 지정 양 (ml)", nl: "Aangepaste hoeveelheid (ml)", pt: "Quantidade personalizada (ml)", sw: "Kiasi maalum (ml)", tr: "Özel miktar (ml)", zh: "自定义量 (毫升)"
  },
  "daily_goal": {
    ar: "الهدف اليومي", de: "Tagesziel", es: "Meta diaria", fr: "Objectif quotidien", hi: "दैनिक लक्ष्य",
    ja: "1日の目標", ko: "일일 목표", nl: "Dagelijks doel", pt: "Meta diária", sw: "Lengo la kila siku", tr: "Günlük hedef", zh: "每日目标"
  },
  "daily_plan": {
    ar: "خطتك اليومية", de: "Dein Tagesplan", es: "Tu plan diario", fr: "Votre plan quotidien", hi: "आपकी दैनिक योजना",
    ja: "今日のプラン", ko: "오늘의 플랜", nl: "Je dagplan", pt: "Seu plano diário", sw: "Mpango wako wa kila siku", tr: "Günlük planın", zh: "您的每日计划"
  },
  "dark_mode": {
    ar: "الوضع الداكن", de: "Dunkelmodus", es: "Modo oscuro", fr: "Mode sombre", hi: "डार्क मोड",
    ja: "ダークモード", ko: "다크 모드", nl: "Donkere modus", pt: "Modo escuro", sw: "Hali ya giza", tr: "Karanlık mod", zh: "深色模式"
  },
  "data_mgmt": {
    ar: "إدارة البيانات", de: "Datenverwaltung", es: "Gestión de datos", fr: "Gestion des données", hi: "डेटा प्रबंधन",
    ja: "データ管理", ko: "데이터 관리", nl: "Gegevensbeheer", pt: "Gerenciamento de dados", sw: "Usimamizi wa data", tr: "Veri yönetimi", zh: "数据管理"
  },
  "desc_build": {
    ar: "كن قوياً وضخماً", de: "Stark & muskulös werden", es: "Fortalecerse y ganar masa", fr: "Devenir fort et musclé", hi: "मजबूत और बड़ा बनें",
    ja: "強く大きくなる", ko: "강하고 크게", nl: "Sterk & gespierd worden", pt: "Ficar forte e grande", sw: "Kuwa na nguvu na mkubwa", tr: "Güçlü ve iri ol", zh: "变得强壮"
  },
  "desc_lose": {
    ar: "حرق الدهون وكن رشيقاً", de: "Fett verbrennen & schlank werden", es: "Quemar grasa y tonificar", fr: "Brûler les graisses et s'affiner", hi: "वसा जलाएं और पतले हों",
    ja: "脂肪を燃焼して引き締める", ko: "지방 연소 & 날씬해지기", nl: "Vet verbranden & slank worden", pt: "Queimar gordura e emagrecer", sw: "Choma mafuta na kuwa mwembamba", tr: "Yağ yak ve zayıfla", zh: "燃脂塑形"
  },
  "desc_maintain": {
    ar: "حافظ على لياقتك وصحتك", de: "Fit & gesund bleiben", es: "Mantente en forma y saludable", fr: "Rester en forme et en bonne santé", hi: "फिट और स्वस्थ रहें",
    ja: "健康を維持する", ko: "건강 유지하기", nl: "Fit & gezond blijven", pt: "Manter a forma e saúde", sw: "Kaa na afya na nguvu", tr: "Formda ve sağlıklı kal", zh: "保持健康"
  },
  "edit_profile": {
    ar: "تعديل الملف الشخصي", de: "Profil bearbeiten", es: "Editar perfil", fr: "Modifier le profil", hi: "प्रोफ़ाइल संपादित करें",
    ja: "プロフィールを編集", ko: "프로필 편집", nl: "Profiel bewerken", pt: "Editar perfil", sw: "Hariri wasifu", tr: "Profili düzenle", zh: "编辑个人资料"
  },
  "enable": {
    ar: "تفعيل", de: "Aktivieren", es: "Habilitar", fr: "Activer", hi: "सक्षम करें",
    ja: "有効にする", ko: "활성화", nl: "Inschakelen", pt: "Ativar", sw: "Wezesha", tr: "Etkinleştir", zh: "启用"
  },
  "favorites": {
    ar: "المفضلة", de: "Favoriten", es: "Favoritos", fr: "Favoris", hi: "पसंदीदा",
    ja: "お気に入り", ko: "즐겨찾기", nl: "Favorieten", pt: "Favoritos", sw: "Vipendwa", tr: "Favoriler", zh: "收藏"
  },
  "food_placeholder": {
    ar: "مثال: دجاج مشوي مع أرز", de: "z.B. Gegrilltes Hähnchen mit Reis", es: "ej. Pollo a la parrilla con arroz", fr: "ex. Poulet grillé avec riz", hi: "उदा. ग्रिल्ड चिकन और चावल",
    ja: "例：グリルチキンとライス", ko: "예: 그릴 치킨과 밥", nl: "bijv. Gegrilde kip met rijst", pt: "ex. Frango grelhado com arroz", sw: "mfano Kuku wa kukaanga na wali", tr: "örn. Izgara tavuk ve pilav", zh: "例如：烤鸡配米饭"
  },
  "fridge": {
    ar: "الثلاجة الذكية", de: "Smart-Kühlschrank", es: "Nevera inteligente", fr: "Frigo intelligent", hi: "स्मार्ट फ्रिज",
    ja: "スマート冷蔵庫", ko: "스마트 냉장고", nl: "Slimme koelkast", pt: "Geladeira inteligente", sw: "Friji ya kisasa", tr: "Akıllı buzdolabı", zh: "智能冰箱"
  },
  "fridge_desc": {
    ar: "التقط صورة لمكونات ثلاجتك.", de: "Mach ein Foto von deinen Kühlschrank-Zutaten.", es: "Toma una foto de los ingredientes de tu nevera.", fr: "Prenez une photo des ingrédients de votre frigo.", hi: "अपने फ्रिज की सामग्री की फोटो लें।",
    ja: "冷蔵庫の食材を撮影してください。", ko: "냉장고 재료 사진을 찍으세요.", nl: "Maak een foto van je koelkast-ingrediënten.", pt: "Tire uma foto dos ingredientes da sua geladeira.", sw: "Piga picha ya viungo vya friji yako.", tr: "Buzdolabı malzemelerinin fotoğrafını çek.", zh: "拍摄您冰箱里的食材。"
  },
  "fridge_scan": {
    ar: "مسح الثلاجة", de: "Kühlschrank scannen", es: "Escanear nevera", fr: "Scanner le frigo", hi: "फ्रिज स्कैन करें",
    ja: "冷蔵庫をスキャン", ko: "냉장고 스캔", nl: "Koelkast scannen", pt: "Escanear geladeira", sw: "Changanua friji", tr: "Buzdolabını tara", zh: "扫描冰箱"
  },
  "generate_plan": {
    ar: "إنشاء خطتي", de: "Meinen Plan erstellen", es: "Generar mi plan", fr: "Générer mon plan", hi: "मेरी योजना बनाएं",
    ja: "プランを生成", ko: "내 플랜 생성", nl: "Mijn plan genereren", pt: "Gerar meu plano", sw: "Unda mpango wangu", tr: "Planımı oluştur", zh: "生成我的计划"
  },
  "goal": {
    ar: "الهدف", de: "Ziel", es: "Meta", fr: "Objectif", hi: "लक्ष्य",
    ja: "目標", ko: "목표", nl: "Doel", pt: "Meta", sw: "Lengo", tr: "Hedef", zh: "目标"
  },
  "goal_subtitle": {
    ar: "ما هي المهمة؟", de: "Was ist die Mission?", es: "¿Cuál es la misión?", fr: "Quelle est la mission?", hi: "मिशन क्या है?",
    ja: "ミッションは何ですか？", ko: "미션이 무엇인가요?", nl: "Wat is de missie?", pt: "Qual é a missão?", sw: "Dhamira ni nini?", tr: "Misyon nedir?", zh: "任务是什么？"
  },
  "goal_title": {
    ar: "هدفك", de: "Dein Ziel", es: "Tu meta", fr: "Votre objectif", hi: "आपका लक्ष्य",
    ja: "あなたの目標", ko: "당신의 목표", nl: "Je doel", pt: "Sua meta", sw: "Lengo lako", tr: "Hedefin", zh: "您的目标"
  },
  "good_afternoon": {
    ar: "مساء الخير", de: "Guten Tag", es: "Buenas tardes", fr: "Bon après-midi", hi: "शुभ दोपहर",
    ja: "こんにちは", ko: "좋은 오후입니다", nl: "Goedemiddag", pt: "Boa tarde", sw: "Habari ya mchana", tr: "İyi öğleden sonralar", zh: "下午好"
  },
  "good_evening": {
    ar: "مساء الخير", de: "Guten Abend", es: "Buenas noches", fr: "Bonsoir", hi: "शुभ संध्या",
    ja: "こんばんは", ko: "좋은 저녁입니다", nl: "Goedenavond", pt: "Boa noite", sw: "Habari ya jioni", tr: "İyi akşamlar", zh: "晚上好"
  },
  "good_morning": {
    ar: "صباح الخير", de: "Guten Morgen", es: "Buenos días", fr: "Bonjour", hi: "सुप्रभात",
    ja: "おはようございます", ko: "좋은 아침입니다", nl: "Goedemorgen", pt: "Bom dia", sw: "Habari ya asubuhi", tr: "Günaydın", zh: "早上好"
  },
  "good_night": {
    ar: "تصبح على خير", de: "Gute Nacht", es: "Buenas noches", fr: "Bonne nuit", hi: "शुभ रात्रि",
    ja: "おやすみなさい", ko: "좋은 밤 되세요", nl: "Welterusten", pt: "Boa noite", sw: "Usiku mwema", tr: "İyi geceler", zh: "晚安"
  },
  "health_context": {
    ar: "السياق الصحي", de: "Gesundheitskontext", es: "Contexto de salud", fr: "Contexte de santé", hi: "स्वास्थ्य संदर्भ",
    ja: "健康状況", ko: "건강 상황", nl: "Gezondheidscontext", pt: "Contexto de saúde", sw: "Muktadha wa afya", tr: "Sağlık durumu", zh: "健康背景"
  },
  "health_subtitle": {
    ar: "سيعدل الذكاء الاصطناعي الأيض بناءً على هذا.", de: "KI passt den Stoffwechsel basierend darauf an.", es: "La IA ajustará el metabolismo basándose en esto.", fr: "L'IA ajustera le métabolisme en fonction de cela.", hi: "AI इसके आधार पर चयापचय समायोजित करेगा।",
    ja: "AIがこれに基づいて代謝を調整します。", ko: "AI가 이를 기반으로 신진대사를 조정합니다.", nl: "AI past het metabolisme hierop aan.", pt: "A IA ajustará o metabolismo com base nisso.", sw: "AI itarekebisha kimetaboliki kulingana na hii.", tr: "Yapay zeka buna göre metabolizmayı ayarlayacak.", zh: "AI将根据此调整新陈代谢。"
  },
  "how_log_food": {
    ar: "كيف تريد تسجيل الطعام؟", de: "Wie möchtest du protokollieren?", es: "¿Cómo quieres registrar?", fr: "Comment voulez-vous enregistrer?", hi: "आप कैसे लॉग करना चाहते हैं?",
    ja: "どのように記録しますか？", ko: "어떻게 기록하시겠어요?", nl: "Hoe wil je loggen?", pt: "Como você quer registrar?", sw: "Unataka kurekodi vipi?", tr: "Nasıl kaydetmek istersin?", zh: "您想如何记录？"
  },
  "how_much": {
    ar: "كم شربت؟", de: "Wie viel hast du getrunken?", es: "¿Cuánto bebiste?", fr: "Combien avez-vous bu?", hi: "आपने कितना पिया?",
    ja: "どのくらい飲みましたか？", ko: "얼마나 마셨나요?", nl: "Hoeveel heb je gedronken?", pt: "Quanto você bebeu?", sw: "Ulikunywa kiasi gani?", tr: "Ne kadar içtin?", zh: "你喝了多少？"
  },
  "identity_subtitle": {
    ar: "اربط تراثك بموقعك.", de: "Verbinde dein Erbe mit deinem Standort.", es: "Conecta tu herencia con tu ubicación.", fr: "Reliez votre patrimoine à votre lieu de résidence.", hi: "अपनी विरासत को अपने स्थान से जोड़ें।",
    ja: "あなたの文化と現在地を結びつけます。", ko: "당신의 유산과 현재 위치를 연결하세요.", nl: "Verbind je erfgoed met je locatie.", pt: "Conecte sua herança com sua localização.", sw: "Unganisha urithi wako na eneo lako.", tr: "Mirasınızı konumunuzla birleştirin.", zh: "将您的文化传承与当前位置联系起来。"
  },
  "identity_title": {
    ar: "الهوية الغذائية", de: "Kulinarische Identität", es: "Identidad culinaria", fr: "Identité culinaire", hi: "पाक पहचान",
    ja: "料理のアイデンティティ", ko: "요리 정체성", nl: "Culinaire identiteit", pt: "Identidade culinária", sw: "Utambulisho wa upishi", tr: "Mutfak kimliği", zh: "烹饪身份"
  },
  "import": {
    ar: "استيراد البيانات", de: "Daten importieren", es: "Importar datos", fr: "Importer les données", hi: "डेटा आयात करें",
    ja: "データをインポート", ko: "데이터 가져오기", nl: "Gegevens importeren", pt: "Importar dados", sw: "Ingiza data", tr: "Veri içe aktar", zh: "导入数据"
  },
  "ingredients_found": {
    ar: "المكونات المكتشفة", de: "Gefundene Zutaten", es: "Ingredientes encontrados", fr: "Ingrédients trouvés", hi: "पाए गए सामग्री",
    ja: "見つかった食材", ko: "발견된 재료", nl: "Gevonden ingrediënten", pt: "Ingredientes encontrados", sw: "Viungo vilivyopatikana", tr: "Bulunan malzemeler", zh: "发现的食材"
  },
  "injuries_placeholder": {
    ar: "مثال: مشكلة في الركبة...", de: "z.B. Knieprobleme...", es: "ej. Rodilla lesionada...", fr: "ex. Problème de genou...", hi: "उदा. घुटने की समस्या...",
    ja: "例：膝の問題...", ko: "예: 무릎 문제...", nl: "bijv. Knieproblemen...", pt: "ex. Problema no joelho...", sw: "mfano Goti baya...", tr: "örn. Diz sorunu...", zh: "例如：膝盖问题..."
  },
  "label_age": {
    ar: "العمر", de: "Alter", es: "Edad", fr: "Âge", hi: "उम्र",
    ja: "年齢", ko: "나이", nl: "Leeftijd", pt: "Idade", sw: "Umri", tr: "Yaş", zh: "年龄"
  },
  "label_height": {
    ar: "الطول (سم)", de: "Größe (cm)", es: "Altura (cm)", fr: "Taille (cm)", hi: "ऊंचाई (सेमी)",
    ja: "身長 (cm)", ko: "키 (cm)", nl: "Lengte (cm)", pt: "Altura (cm)", sw: "Urefu (cm)", tr: "Boy (cm)", zh: "身高 (厘米)"
  },
  "label_weight": {
    ar: "الوزن (كجم)", de: "Gewicht (kg)", es: "Peso (kg)", fr: "Poids (kg)", hi: "वजन (किग्रा)",
    ja: "体重 (kg)", ko: "체중 (kg)", nl: "Gewicht (kg)", pt: "Peso (kg)", sw: "Uzito (kg)", tr: "Kilo (kg)", zh: "体重 (公斤)"
  },
  "language": {
    ar: "اللغة", de: "Sprache", es: "Idioma", fr: "Langue", hi: "भाषा",
    ja: "言語", ko: "언어", nl: "Taal", pt: "Idioma", sw: "Lugha", tr: "Dil", zh: "语言"
  },
  "log_meal": {
    ar: "تسجيل وجبة", de: "Mahlzeit protokollieren", es: "Registrar comida", fr: "Enregistrer repas", hi: "भोजन लॉग करें",
    ja: "食事を記録", ko: "식사 기록", nl: "Maaltijd loggen", pt: "Registrar refeição", sw: "Rekodi mlo", tr: "Öğün kaydet", zh: "记录餐食"
  },
  "log_water": {
    ar: "تسجيل الماء", de: "Wasser protokollieren", es: "Registrar agua", fr: "Enregistrer eau", hi: "पानी लॉग करें",
    ja: "水分を記録", ko: "물 기록", nl: "Water loggen", pt: "Registrar água", sw: "Rekodi maji", tr: "Su kaydet", zh: "记录饮水"
  },
  "lose_weight": {
    ar: "إنقاص الوزن", de: "Abnehmen", es: "Perder peso", fr: "Perdre du poids", hi: "वजन कम करें",
    ja: "減量", ko: "체중 감량", nl: "Afvallen", pt: "Perder peso", sw: "Punguza uzito", tr: "Kilo ver", zh: "减重"
  },
  "maintain": {
    ar: "الحفاظ", de: "Halten", es: "Mantener", fr: "Maintenir", hi: "बनाए रखें",
    ja: "維持", ko: "유지", nl: "Behouden", pt: "Manter", sw: "Dumisha", tr: "Koru", zh: "保持"
  },
  "medications": {
    ar: "الأدوية", de: "Medikamente", es: "Medicamentos", fr: "Médicaments", hi: "दवाइयां",
    ja: "服用薬", ko: "복용 약물", nl: "Medicijnen", pt: "Medicamentos", sw: "Dawa", tr: "İlaçlar", zh: "药物"
  },
  "meds_placeholder": {
    ar: "مثال: الإنسولين...", de: "z.B. Insulin...", es: "ej. Insulina...", fr: "ex. Insuline...", hi: "उदा. इंसुलिन...",
    ja: "例：インスリン...", ko: "예: 인슐린...", nl: "bijv. Insuline...", pt: "ex. Insulina...", sw: "mfano Insulini...", tr: "örn. İnsülin...", zh: "例如：胰岛素..."
  },
  "missing": {
    ar: "مفقود", de: "Fehlt", es: "Falta", fr: "Manquant", hi: "गायब",
    ja: "不足", ko: "누락", nl: "Ontbreekt", pt: "Faltando", sw: "Inakosekana", tr: "Eksik", zh: "缺少"
  },
  "mood_balanced": {
    ar: "شيف متوازن", de: "Ausgewogener Koch", es: "Chef equilibrado", fr: "Chef équilibré", hi: "संतुलित शेफ",
    ja: "バランスシェフ", ko: "균형 잡힌 셰프", nl: "Evenwichtige chef", pt: "Chef equilibrado", sw: "Mpishi wa usawa", tr: "Dengeli şef", zh: "均衡大厨"
  },
  "mood_gourmet": {
    ar: "تجربة ذواقة", de: "Gourmet-Erlebnis", es: "Experiencia gourmet", fr: "Expérience gastronomique", hi: "गोरमे अनुभव",
    ja: "グルメ体験", ko: "고급 경험", nl: "Gastronomische ervaring", pt: "Experiência gourmet", sw: "Uzoefu wa kifahari", tr: "Gurme deneyimi", zh: "美食体验"
  },
  "mood_quick": {
    ar: "سريع وسهل", de: "Schnell & Einfach", es: "Rápido y fácil", fr: "Rapide et facile", hi: "जल्दी और आसान",
    ja: "クイック＆イージー", ko: "빠르고 쉬운", nl: "Snel & Makkelijk", pt: "Rápido e fácil", sw: "Haraka na rahisi", tr: "Hızlı ve kolay", zh: "快速简单"
  },
  "no_saved": {
    ar: "لا توجد وجبات محفوظة بعد.", de: "Noch keine gespeicherten Mahlzeiten.", es: "Aún no hay comidas guardadas.", fr: "Pas encore de repas enregistrés.", hi: "अभी कोई सहेजे गए भोजन नहीं।",
    ja: "保存された食事はまだありません。", ko: "저장된 식사가 없습니다.", nl: "Nog geen opgeslagen maaltijden.", pt: "Nenhuma refeição salva ainda.", sw: "Hakuna milo zilizohifadhiwa bado.", tr: "Henüz kaydedilmiş yemek yok.", zh: "暂无保存的餐食。"
  },
  "notifications": {
    ar: "الإشعارات", de: "Benachrichtigungen", es: "Notificaciones", fr: "Notifications", hi: "सूचनाएं",
    ja: "通知", ko: "알림", nl: "Meldingen", pt: "Notificações", sw: "Arifa", tr: "Bildirimler", zh: "通知"
  },
  "ok": {
    ar: "حسناً", de: "OK", es: "OK", fr: "OK", hi: "ठीक है",
    ja: "OK", ko: "확인", nl: "OK", pt: "OK", sw: "Sawa", tr: "Tamam", zh: "确定"
  },
  "open_camera": {
    ar: "فتح الكاميرا", de: "Kamera öffnen", es: "Abrir cámara", fr: "Ouvrir la caméra", hi: "कैमरा खोलें",
    ja: "カメラを開く", ko: "카메라 열기", nl: "Camera openen", pt: "Abrir câmera", sw: "Fungua kamera", tr: "Kamerayı aç", zh: "打开相机"
  },
  "origin_label": {
    ar: "الأصل / التراث", de: "Herkunft / Erbe", es: "Origen / Herencia", fr: "Origine / Héritage", hi: "मूल / विरासत",
    ja: "出身 / ルーツ", ko: "출신 / 유산", nl: "Afkomst / Erfgoed", pt: "Origem / Herança", sw: "Asili / Urithi", tr: "Köken / Miras", zh: "籍贯 / 传承"
  },
  "origin_placeholder": {
    ar: "مثال: لبناني، مكسيكي...", de: "z.B. Libanesisch, Mexikanisch...", es: "ej. Libanés, Mexicano...", fr: "ex. Libanais, Mexicain...", hi: "उदा. लेबनानी, मैक्सिकन...",
    ja: "例：レバノン、メキシコ...", ko: "예: 레바논, 멕시코...", nl: "bijv. Libanees, Mexicaans...", pt: "ex. Libanês, Mexicano...", sw: "mfano Mlebanoni, Mmeksiko...", tr: "örn. Lübnan, Meksika...", zh: "例如：黎巴嫩、墨西哥..."
  },
  "placeholder_name": {
    ar: "اسمك", de: "Dein Name", es: "Tu nombre", fr: "Votre nom", hi: "आपका नाम",
    ja: "お名前", ko: "이름", nl: "Je naam", pt: "Seu nome", sw: "Jina lako", tr: "Adınız", zh: "您的名字"
  },
  "prot": {
    ar: "بروتين", de: "Protein", es: "proteína", fr: "protéines", hi: "प्रोटीन",
    ja: "タンパク質", ko: "단백질", nl: "eiwit", pt: "proteína", sw: "protini", tr: "protein", zh: "蛋白质"
  },
  "protein": {
    ar: "البروتين", de: "Protein", es: "Proteína", fr: "Protéines", hi: "प्रोटीन",
    ja: "タンパク質", ko: "단백질", nl: "Eiwit", pt: "Proteína", sw: "Protini", tr: "Protein", zh: "蛋白质"
  },
  "calories": {
    ar: "السعرات الحرارية", de: "Kalorien", es: "Calorías", fr: "Calories", hi: "कैलोरी",
    ja: "カロリー", ko: "칼로리", nl: "Calorieën", pt: "Calorias", sw: "Kalori", tr: "Kalori", zh: "卡路里"
  },
  "refine_plan": {
    ar: "تحسين الخطة", de: "Plan verfeinern", es: "Refinar plan", fr: "Affiner le plan", hi: "योजना परिष्कृत करें",
    ja: "プランを調整", ko: "플랜 조정", nl: "Plan verfijnen", pt: "Refinar plano", sw: "Boresha mpango", tr: "Planı iyileştir", zh: "优化计划"
  },
  "refining": {
    ar: "جارٍ التحسين...", de: "Verfeinere...", es: "Refinando...", fr: "Affinage...", hi: "परिष्कृत हो रहा है...",
    ja: "調整中...", ko: "조정 중...", nl: "Verfijnen...", pt: "Refinando...", sw: "Inaboreshwa...", tr: "İyileştiriliyor...", zh: "优化中..."
  },
  "remind_in": {
    ar: "ذكرني بعد...", de: "Erinnere mich in...", es: "Recordarme en...", fr: "Me rappeler dans...", hi: "मुझे याद दिलाएं...",
    ja: "後でリマインド...", ko: "나중에 알림...", nl: "Herinner me over...", pt: "Lembrar em...", sw: "Nikumbushe baada ya...", tr: "Şu süre sonra hatırlat...", zh: "提醒我在..."
  },
  "reminder": {
    ar: "تذكير", de: "Erinnerung", es: "Recordatorio", fr: "Rappel", hi: "रिमाइंडर",
    ja: "リマインダー", ko: "알림", nl: "Herinnering", pt: "Lembrete", sw: "Ukumbusho", tr: "Hatırlatıcı", zh: "提醒"
  },
  "residence_label": {
    ar: "مكان الإقامة الحالي", de: "Aktueller Wohnort", es: "Residencia actual", fr: "Résidence actuelle", hi: "वर्तमान निवास",
    ja: "現在の居住地", ko: "현재 거주지", nl: "Huidige woonplaats", pt: "Residência atual", sw: "Makazi ya sasa", tr: "Şu anki ikamet", zh: "当前居住地"
  },
  "residence_placeholder": {
    ar: "مثال: برلين، دبي...", de: "z.B. Berlin, Dubai...", es: "ej. Berlín, Dubái...", fr: "ex. Berlin, Dubaï...", hi: "उदा. बर्लिन, दुबई...",
    ja: "例：ベルリン、ドバイ...", ko: "예: 베를린, 두바이...", nl: "bijv. Berlijn, Dubai...", pt: "ex. Berlim, Dubai...", sw: "mfano Berlin, Dubai...", tr: "örn. Berlin, Dubai...", zh: "例如：柏林、迪拜..."
  },
  "save_favorite": {
    ar: "حفظ في المفضلة", de: "Zu Favoriten hinzufügen", es: "Guardar en favoritos", fr: "Ajouter aux favoris", hi: "पसंदीदा में सहेजें",
    ja: "お気に入りに保存", ko: "즐겨찾기에 저장", nl: "Opslaan in favorieten", pt: "Salvar nos favoritos", sw: "Hifadhi kwenye vipendwa", tr: "Favorilere kaydet", zh: "收藏"
  },
  "save_update": {
    ar: "حفظ وتحديث الخطة", de: "Speichern & Plan aktualisieren", es: "Guardar y actualizar plan", fr: "Enregistrer et mettre à jour le plan", hi: "सहेजें और योजना अपडेट करें",
    ja: "保存してプランを更新", ko: "저장하고 플랜 업데이트", nl: "Opslaan & plan bijwerken", pt: "Salvar e atualizar plano", sw: "Hifadhi na usasishe mpango", tr: "Kaydet ve planı güncelle", zh: "保存并更新计划"
  },
  "saved_meals": {
    ar: "الوجبات المحفوظة", de: "Gespeicherte Mahlzeiten", es: "Comidas guardadas", fr: "Repas enregistrés", hi: "सहेजे गए भोजन",
    ja: "保存した食事", ko: "저장된 식사", nl: "Opgeslagen maaltijden", pt: "Refeições salvas", sw: "Milo zilizohifadhiwa", tr: "Kaydedilen yemekler", zh: "保存的餐食"
  },
  "select_language": {
    ar: "اختر اللغة", de: "Sprache wählen", es: "Elegir idioma", fr: "Choisir la langue", hi: "भाषा चुनें",
    ja: "言語を選択", ko: "언어 선택", nl: "Kies taal", pt: "Escolher idioma", sw: "Chagua lugha", tr: "Dil seçin", zh: "选择语言"
  },
  "sign_out": {
    ar: "تسجيل الخروج", de: "Abmelden", es: "Cerrar sesión", fr: "Déconnexion", hi: "साइन आउट",
    ja: "サインアウト", ko: "로그아웃", nl: "Uitloggen", pt: "Sair", sw: "Toka", tr: "Çıkış yap", zh: "退出登录"
  },
  "sign_in": {
    ar: "تسجيل الدخول", de: "Anmelden", es: "Iniciar sesión", fr: "Connexion", hi: "साइन इन",
    ja: "サインイン", ko: "로그인", nl: "Inloggen", pt: "Entrar", sw: "Ingia", tr: "Giriş yap", zh: "登录"
  },
  "skip": {
    ar: "تخطي", de: "Überspringen", es: "Omitir", fr: "Passer", hi: "छोड़ें",
    ja: "スキップ", ko: "건너뛰기", nl: "Overslaan", pt: "Pular", sw: "Ruka", tr: "Atla", zh: "跳过"
  },
  "sleep": {
    ar: "النوم", de: "Schlaf", es: "Sueño", fr: "Sommeil", hi: "नींद",
    ja: "睡眠", ko: "수면", nl: "Slaap", pt: "Sono", sw: "Usingizi", tr: "Uyku", zh: "睡眠"
  },
  "smart_chef": {
    ar: "الطباخ الذكي", de: "Smart Chef", es: "Chef inteligente", fr: "Chef intelligent", hi: "स्मार्ट शेफ",
    ja: "スマートシェフ", ko: "스마트 셰프", nl: "Slimme chef", pt: "Chef inteligente", sw: "Mpishi wa kisasa", tr: "Akıllı şef", zh: "智能大厨"
  },
  "smart_reminders": {
    ar: "التذكيرات الذكية", de: "Smarte Erinnerungen", es: "Recordatorios inteligentes", fr: "Rappels intelligents", hi: "स्मार्ट रिमाइंडर",
    ja: "スマートリマインダー", ko: "스마트 알림", nl: "Slimme herinneringen", pt: "Lembretes inteligentes", sw: "Vikumbusho vya kisasa", tr: "Akıllı hatırlatıcılar", zh: "智能提醒"
  },
  "snooze": {
    ar: "تأجيل", de: "Schlummern", es: "Posponer", fr: "Reporter", hi: "स्नूज़",
    ja: "スヌーズ", ko: "다시 알림", nl: "Snoozen", pt: "Soneca", sw: "Ahirisha", tr: "Ertele", zh: "稍后提醒"
  },
  "status_healthy": {
    ar: "صحي", de: "Gesund", es: "Saludable", fr: "En bonne santé", hi: "स्वस्थ",
    ja: "健康", ko: "건강함", nl: "Gezond", pt: "Saudável", sw: "Mzima", tr: "Sağlıklı", zh: "健康"
  },
  "status_recovering": {
    ar: "في فترة التعافي", de: "In Genesung", es: "Recuperándose", fr: "En convalescence", hi: "ठीक हो रहा है",
    ja: "回復中", ko: "회복 중", nl: "Herstellende", pt: "Recuperando", sw: "Inapona", tr: "İyileşiyor", zh: "恢复中"
  },
  "status_sick": {
    ar: "مريض", de: "Krank", es: "Enfermo", fr: "Malade", hi: "बीमार",
    ja: "病気", ko: "아픔", nl: "Ziek", pt: "Doente", sw: "Mgonjwa", tr: "Hasta", zh: "生病"
  },
  "suggested_recipes": {
    ar: "الوصفات المقترحة", de: "Vorgeschlagene Rezepte", es: "Recetas sugeridas", fr: "Recettes suggérées", hi: "सुझाई गई रेसिपी",
    ja: "おすすめレシピ", ko: "추천 레시피", nl: "Voorgestelde recepten", pt: "Receitas sugeridas", sw: "Mapishi yaliyopendekezwa", tr: "Önerilen tarifler", zh: "推荐食谱"
  },
  "symptoms_placeholder": {
    ar: "مثال: إنفلونزا، حمى...", de: "z.B. Grippe, Fieber...", es: "ej. Gripe, Fiebre...", fr: "ex. Grippe, Fièvre...", hi: "उदा. फ्लू, बुखार...",
    ja: "例：インフルエンザ、発熱...", ko: "예: 독감, 열...", nl: "bijv. Griep, Koorts...", pt: "ex. Gripe, Febre...", sw: "mfano Homa, Joto...", tr: "örn. Grip, Ateş...", zh: "例如：流感、发烧..."
  },
  "symptoms_question": {
    ar: "ما هي أعراضك؟", de: "Was sind deine Symptome?", es: "¿Cuáles son tus síntomas?", fr: "Quels sont vos symptômes?", hi: "आपके लक्षण क्या हैं?",
    ja: "症状は何ですか？", ko: "증상이 무엇인가요?", nl: "Wat zijn je symptomen?", pt: "Quais são seus sintomas?", sw: "Dalili zako ni zipi?", tr: "Belirtileriniz neler?", zh: "您有什么症状？"
  },
  "tap_refresh": {
    ar: "اضغط تحديث لإنشاء خطة.", de: "Tippe auf Aktualisieren, um einen Plan zu erstellen.", es: "Toca actualizar para generar un plan.", fr: "Appuyez sur actualiser pour générer un plan.", hi: "योजना बनाने के लिए रिफ्रेश पर टैप करें।",
    ja: "プランを作成するには更新をタップ。", ko: "플랜을 생성하려면 새로고침을 탭하세요.", nl: "Tik op vernieuwen om een plan te genereren.", pt: "Toque em atualizar para gerar um plano.", sw: "Gusa kusasisha ili kuunda mpango.", tr: "Plan oluşturmak için yenile'ye dokun.", zh: "点击刷新生成计划。"
  },
  "terms_agree": {
    ar: "بالمتابعة، أنت توافق على الشروط.", de: "Mit dem Fortfahren stimmst du den Bedingungen zu.", es: "Al continuar, aceptas los términos.", fr: "En continuant, vous acceptez les conditions.", hi: "जारी रखकर, आप शर्तों से सहमत हैं।",
    ja: "続行すると利用規約に同意したことになります。", ko: "계속하면 약관에 동의하게 됩니다.", nl: "Door verder te gaan, ga je akkoord met de voorwaarden.", pt: "Ao continuar, você concorda com os termos.", sw: "Kwa kuendelea, unakubali masharti.", tr: "Devam ederek şartları kabul ediyorsunuz.", zh: "继续即表示您同意条款。"
  },
  "text": {
    ar: "نص", de: "Text", es: "Texto", fr: "Texte", hi: "टेक्स्ट",
    ja: "テキスト", ko: "텍스트", nl: "Tekst", pt: "Texto", sw: "Maandishi", tr: "Metin", zh: "文本"
  },
  "update_weight": {
    ar: "تحديث الوزن", de: "Gewicht aktualisieren", es: "Actualizar peso", fr: "Mettre à jour le poids", hi: "वजन अपडेट करें",
    ja: "体重を更新", ko: "체중 업데이트", nl: "Gewicht bijwerken", pt: "Atualizar peso", sw: "Sasisha uzito", tr: "Kiloyu güncelle", zh: "更新体重"
  },
  "water": {
    ar: "ماء", de: "Wasser", es: "Agua", fr: "Eau", hi: "पानी",
    ja: "水", ko: "물", nl: "Water", pt: "Água", sw: "Maji", tr: "Su", zh: "水"
  },
  "weekly_check": {
    ar: "المراجعة الأسبوعية", de: "Wöchentliche Kontrolle", es: "Control semanal", fr: "Bilan hebdomadaire", hi: "साप्ताहिक जांच",
    ja: "週次チェック", ko: "주간 체크인", nl: "Wekelijkse controle", pt: "Verificação semanal", sw: "Ukaguzi wa kila wiki", tr: "Haftalık kontrol", zh: "每周检查"
  },
  "weight_msg": {
    ar: "مر أسبوع! حدث وزنك.", de: "Eine Woche ist vergangen! Aktualisiere dein Gewicht.", es: "¡Ha pasado una semana! Actualiza tu peso.", fr: "Une semaine s'est écoulée ! Mettez à jour votre poids.", hi: "एक हफ्ता हो गया! अपना वजन अपडेट करें।",
    ja: "1週間経ちました！体重を更新してください。", ko: "일주일이 지났어요! 체중을 업데이트하세요.", nl: "Er is een week voorbij! Werk je gewicht bij.", pt: "Uma semana se passou! Atualize seu peso.", sw: "Wiki moja imepita! Sasisha uzito wako.", tr: "Bir hafta geçti! Kilonuzu güncelleyin.", zh: "一周过去了！更新您的体重。"
  },
  "weight_opt": {
    ar: "الوزن/الحصة (اختياري)", de: "Gewicht/Portion (Optional)", es: "Peso/Porción (Opcional)", fr: "Poids/Portion (Optionnel)", hi: "वजन/पोर्शन (वैकल्पिक)",
    ja: "重量/分量（任意）", ko: "무게/분량 (선택사항)", nl: "Gewicht/Portie (Optioneel)", pt: "Peso/Porção (Opcional)", sw: "Uzito/Kipimo (Hiari)", tr: "Ağırlık/Porsiyon (Opsiyonel)", zh: "重量/份量（可选）"
  },
  "weight_placeholder": {
    ar: "مثال: 200 جرام أو \"كوب واحد\"", de: "z.B. 200g oder \"1 Tasse\"", es: "ej. 200g o \"1 taza\"", fr: "ex. 200g ou \"1 tasse\"", hi: "उदा. 200 ग्राम या \"1 कप\"",
    ja: "例：200gまたは「1カップ」", ko: "예: 200g 또는 \"1컵\"", nl: "bijv. 200g of \"1 kopje\"", pt: "ex. 200g ou \"1 xícara\"", sw: "mfano 200g au \"kikombe 1\"", tr: "örn. 200g veya \"1 bardak\"", zh: "例如：200克或\"1杯\""
  },
  "welcome_subtitle": {
    ar: "حياة مدعومة بالذكاء الاصطناعي", de: "KI-gestütztes Leben", es: "Vida impulsada por IA", fr: "Vie assistée par l'IA", hi: "AI-संचालित जीवन",
    ja: "AI パワード ライフ", ko: "AI 기반 생활", nl: "AI-gestuurd leven", pt: "Vida com IA", sw: "Maisha yanayoendeshwa na AI", tr: "Yapay zeka destekli yaşam", zh: "AI 驱动的生活"
  },
  "what_did_eat": {
    ar: "ماذا أكلت؟", de: "Was hast du gegessen?", es: "¿Qué comiste?", fr: "Qu'avez-vous mangé?", hi: "आपने क्या खाया?",
    ja: "何を食べましたか？", ko: "무엇을 드셨나요?", nl: "Wat heb je gegeten?", pt: "O que você comeu?", sw: "Ulikula nini?", tr: "Ne yedin?", zh: "您吃了什么？"
  },
  "yes_did_it": {
    ar: "نعم، فعلتها!", de: "Ja, geschafft!", es: "¡Sí, lo hice!", fr: "Oui, c'est fait !", hi: "हाँ, मैंने किया!",
    ja: "はい、やりました！", ko: "네, 했어요!", nl: "Ja, gedaan!", pt: "Sim, fiz isso!", sw: "Ndio, nimefanya!", tr: "Evet, yaptım!", zh: "是的，我做到了！"
  },
  "later": {
    ar: "لاحقاً", de: "Später", es: "Más tarde", fr: "Plus tard", hi: "बाद में",
    ja: "後で", ko: "나중에", nl: "Later", pt: "Mais tarde", sw: "Baadaye", tr: "Sonra", zh: "稍后"
  },
  "watch_ad": {
    ar: "مشاهدة إعلان", de: "Werbung ansehen", es: "Ver anuncio", fr: "Regarder une publicité", hi: "विज्ञापन देखें",
    ja: "広告を見る", ko: "광고 보기", nl: "Advertentie bekijken", pt: "Assistir anúncio", sw: "Angalia tangazo", tr: "Reklam izle", zh: "观看广告"
  },
  "back": {
    ar: "رجوع", de: "Zurück", es: "Atrás", fr: "Retour", hi: "वापस",
    ja: "戻る", ko: "뒤로", nl: "Terug", pt: "Voltar", sw: "Rudi", tr: "Geri", zh: "返回"
  },
  "done": {
    ar: "تم", de: "Fertig", es: "Hecho", fr: "Terminé", hi: "हो गया",
    ja: "完了", ko: "완료", nl: "Klaar", pt: "Concluído", sw: "Imekamilika", tr: "Tamam", zh: "完成"
  },
  "version": {
    ar: "الإصدار", de: "Version", es: "Versión", fr: "Version", hi: "संस्करण",
    ja: "バージョン", ko: "버전", nl: "Versie", pt: "Versão", sw: "Toleo", tr: "Sürüm", zh: "版本"
  },
  "metric_units": {
    ar: "الوحدات المترية", de: "Metrische Einheiten", es: "Unidades métricas", fr: "Unités métriques", hi: "मीट्रिक इकाइयां",
    ja: "メートル法", ko: "미터법 단위", nl: "Metrische eenheden", pt: "Unidades métricas", sw: "Vipimo vya metriki", tr: "Metrik birimler", zh: "公制单位"
  },
  "metric_units_desc": {
    ar: "استخدام الكيلوجرام والسنتيمتر والكيلومتر.", de: "Kilogramm, Zentimeter und Kilometer verwenden.", es: "Usar kilogramos, centímetros y kilómetros.", fr: "Utiliser les kilogrammes, centimètres et kilomètres.", hi: "किलोग्राम, सेंटीमीटर और किलोमीटर का उपयोग करें।",
    ja: "キログラム、センチメートル、キロメートルを使用。", ko: "킬로그램, 센티미터, 킬로미터 사용.", nl: "Kilogram, centimeter en kilometer gebruiken.", pt: "Usar quilogramas, centímetros e quilômetros.", sw: "Tumia kilogramu, sentimita na kilomita.", tr: "Kilogram, santimetre ve kilometre kullanın.", zh: "使用公斤、厘米和公里。"
  },
  "notifications_desc": {
    ar: "احصل على التذكيرات والتنبيهات.", de: "Erhalte Erinnerungen und Benachrichtigungen.", es: "Recibe recordatorios y alertas.", fr: "Recevez des rappels et des alertes.", hi: "रिमाइंडर और अलर्ट प्राप्त करें।",
    ja: "リマインダーとアラートを受け取る。", ko: "알림과 알림을 받으세요.", nl: "Ontvang herinneringen en meldingen.", pt: "Receba lembretes e alertas.", sw: "Pata vikumbusho na arifa.", tr: "Hatırlatıcılar ve uyarılar alın.", zh: "获取提醒和警报。"
  },
  "continue_as_guest": {
    ar: "المتابعة كضيف", de: "Als Gast fortfahren", es: "Continuar como invitado", fr: "Continuer en tant qu'invité", hi: "अतिथि के रूप में जारी रखें",
    ja: "ゲストとして続ける", ko: "게스트로 계속", nl: "Doorgaan als gast", pt: "Continuar como convidado", sw: "Endelea kama mgeni", tr: "Misafir olarak devam et", zh: "以访客身份继续"
  },
  "powered_by_gemini": {
    ar: "مدعوم بواسطة Gemini", de: "Unterstützt von Gemini", es: "Impulsado por Gemini", fr: "Propulsé par Gemini", hi: "Gemini द्वारा संचालित",
    ja: "Gemini で動作", ko: "Gemini 기반", nl: "Ondersteund door Gemini", pt: "Desenvolvido com Gemini", sw: "Imeendeshwa na Gemini", tr: "Gemini tarafından desteklenmektedir", zh: "由 Gemini 提供支持"
  },
  // ACTION KEYS
  "action.activity.default": {
    ar: "تمرين", de: "Training", es: "Entrenamiento", fr: "Entraînement", hi: "व्यायाम",
    ja: "ワークアウト", ko: "운동", nl: "Training", pt: "Treino", sw: "Mazoezi", tr: "Antrenman", zh: "锻炼"
  },
  "action.confirm_done": {
    ar: "تم الإنجاز", de: "Als erledigt markieren", es: "Marcar como hecho", fr: "Marquer comme fait", hi: "पूर्ण चिह्नित करें",
    ja: "完了にする", ko: "완료로 표시", nl: "Markeer als klaar", pt: "Marcar como feito", sw: "Weka alama imekamilika", tr: "Tamamlandı olarak işaretle", zh: "标记完成"
  },
  "action.default.title": {
    ar: "كل شيء جاهز", de: "Alles erledigt", es: "Todo listo", fr: "Tout est prêt", hi: "सब तैयार है",
    ja: "準備完了", ko: "모두 준비됨", nl: "Alles klaar", pt: "Tudo pronto", sw: "Uko tayari", tr: "Her şey hazır", zh: "一切就绪"
  },
  "action.favorites.title": {
    ar: "المفضلة", de: "Favoriten", es: "Favoritos", fr: "Favoris", hi: "पसंदीदा",
    ja: "お気に入り", ko: "즐겨찾기", nl: "Favorieten", pt: "Favoritos", sw: "Vipendwa", tr: "Favoriler", zh: "收藏夹"
  },
  "action.log_activity.title": {
    ar: "تسجيل النشاط", de: "Aktivität protokollieren", es: "Registrar actividad", fr: "Enregistrer activité", hi: "गतिविधि लॉग करें",
    ja: "アクティビティを記録", ko: "활동 기록", nl: "Activiteit loggen", pt: "Registrar atividade", sw: "Rekodi shughuli", tr: "Aktivite kaydet", zh: "记录活动"
  },
  "action.log_food.title": {
    ar: "تسجيل الطعام", de: "Essen protokollieren", es: "Registrar comida", fr: "Enregistrer repas", hi: "खाना लॉग करें",
    ja: "食事を記録", ko: "음식 기록", nl: "Eten loggen", pt: "Registrar comida", sw: "Rekodi chakula", tr: "Yemek kaydet", zh: "记录食物"
  },
  "action.log_water.title": {
    ar: "تسجيل الماء", de: "Wasser protokollieren", es: "Registrar agua", fr: "Enregistrer eau", hi: "पानी लॉग करें",
    ja: "水分を記録", ko: "물 기록", nl: "Water loggen", pt: "Registrar água", sw: "Rekodi maji", tr: "Su kaydet", zh: "记录饮水"
  },
  "action.skip": {
    ar: "تخطي", de: "Überspringen", es: "Omitir", fr: "Passer", hi: "छोड़ें",
    ja: "スキップ", ko: "건너뛰기", nl: "Overslaan", pt: "Pular", sw: "Ruka", tr: "Atla", zh: "跳过"
  },
  "action.snooze": {
    ar: "تأجيل", de: "Schlummern", es: "Posponer", fr: "Reporter", hi: "स्नूज़",
    ja: "スヌーズ", ko: "다시 알림", nl: "Snoozen", pt: "Soneca", sw: "Ahirisha", tr: "Ertele", zh: "稍后提醒"
  },
  // ALERT KEYS
  "alert.error": {
    ar: "خطأ", de: "Fehler", es: "Error", fr: "Erreur", hi: "त्रुटि",
    ja: "エラー", ko: "오류", nl: "Fout", pt: "Erro", sw: "Hitilafu", tr: "Hata", zh: "错误"
  },
  "alert.success": {
    ar: "نجاح", de: "Erfolg", es: "Éxito", fr: "Succès", hi: "सफलता",
    ja: "成功", ko: "성공", nl: "Succes", pt: "Sucesso", sw: "Mafanikio", tr: "Başarılı", zh: "成功"
  },
  "alert.done": {
    ar: "تم", de: "Fertig", es: "Hecho", fr: "Terminé", hi: "हो गया",
    ja: "完了", ko: "완료", nl: "Klaar", pt: "Concluído", sw: "Imekamilika", tr: "Tamam", zh: "完成"
  },
  "alert.logged": {
    ar: "تم التسجيل", de: "Protokolliert", es: "Registrado", fr: "Enregistré", hi: "लॉग किया गया",
    ja: "記録しました", ko: "기록됨", nl: "Gelogd", pt: "Registrado", sw: "Imeandikwa", tr: "Kaydedildi", zh: "已记录"
  },
  // AUTH KEYS
  "auth.sign_in": {
    ar: "تسجيل الدخول", de: "Anmelden", es: "Iniciar sesión", fr: "Se connecter", hi: "साइन इन",
    ja: "サインイン", ko: "로그인", nl: "Inloggen", pt: "Entrar", sw: "Ingia", tr: "Giriş yap", zh: "登录"
  },
  "auth.sign_up": {
    ar: "إنشاء حساب", de: "Registrieren", es: "Registrarse", fr: "S'inscrire", hi: "साइन अप",
    ja: "サインアップ", ko: "회원가입", nl: "Registreren", pt: "Cadastrar", sw: "Jisajili", tr: "Kayıt ol", zh: "注册"
  },
  "auth.sign_out": {
    ar: "تسجيل الخروج", de: "Abmelden", es: "Cerrar sesión", fr: "Se déconnecter", hi: "साइन आउट",
    ja: "サインアウト", ko: "로그아웃", nl: "Uitloggen", pt: "Sair", sw: "Toka", tr: "Çıkış yap", zh: "退出"
  },
  "auth.email": {
    ar: "البريد الإلكتروني", de: "E-Mail", es: "Correo electrónico", fr: "E-mail", hi: "ईमेल",
    ja: "メール", ko: "이메일", nl: "E-mail", pt: "E-mail", sw: "Barua pepe", tr: "E-posta", zh: "邮箱"
  },
  "auth.password": {
    ar: "كلمة المرور", de: "Passwort", es: "Contraseña", fr: "Mot de passe", hi: "पासवर्ड",
    ja: "パスワード", ko: "비밀번호", nl: "Wachtwoord", pt: "Senha", sw: "Nywila", tr: "Şifre", zh: "密码"
  },
  // COMMON KEYS
  "add": {
    ar: "إضافة", de: "Hinzufügen", es: "Añadir", fr: "Ajouter", hi: "जोड़ें",
    ja: "追加", ko: "추가", nl: "Toevoegen", pt: "Adicionar", sw: "Ongeza", tr: "Ekle", zh: "添加"
  },
  "edit": {
    ar: "تعديل", de: "Bearbeiten", es: "Editar", fr: "Modifier", hi: "संपादित करें",
    ja: "編集", ko: "편집", nl: "Bewerken", pt: "Editar", sw: "Hariri", tr: "Düzenle", zh: "编辑"
  },
  "save": {
    ar: "حفظ", de: "Speichern", es: "Guardar", fr: "Enregistrer", hi: "सहेजें",
    ja: "保存", ko: "저장", nl: "Opslaan", pt: "Salvar", sw: "Hifadhi", tr: "Kaydet", zh: "保存"
  },
  "remove": {
    ar: "إزالة", de: "Entfernen", es: "Eliminar", fr: "Supprimer", hi: "हटाएं",
    ja: "削除", ko: "삭제", nl: "Verwijderen", pt: "Remover", sw: "Ondoa", tr: "Kaldır", zh: "移除"
  },
  "reset": {
    ar: "إعادة تعيين", de: "Zurücksetzen", es: "Restablecer", fr: "Réinitialiser", hi: "रीसेट",
    ja: "リセット", ko: "초기화", nl: "Resetten", pt: "Redefinir", sw: "Weka upya", tr: "Sıfırla", zh: "重置"
  },
  "next": {
    ar: "التالي", de: "Weiter", es: "Siguiente", fr: "Suivant", hi: "अगला",
    ja: "次へ", ko: "다음", nl: "Volgende", pt: "Próximo", sw: "Ifuatayo", tr: "İleri", zh: "下一步"
  },
  "yes": {
    ar: "نعم", de: "Ja", es: "Sí", fr: "Oui", hi: "हां",
    ja: "はい", ko: "예", nl: "Ja", pt: "Sim", sw: "Ndiyo", tr: "Evet", zh: "是"
  },
  "no": {
    ar: "لا", de: "Nein", es: "No", fr: "Non", hi: "नहीं",
    ja: "いいえ", ko: "아니오", nl: "Nee", pt: "Não", sw: "Hapana", tr: "Hayır", zh: "否"
  },
  "optional": {
    ar: "اختياري", de: "Optional", es: "Opcional", fr: "Optionnel", hi: "वैकल्पिक",
    ja: "任意", ko: "선택사항", nl: "Optioneel", pt: "Opcional", sw: "Hiari", tr: "İsteğe bağlı", zh: "可选"
  },
  "planned": {
    ar: "مخطط", de: "Geplant", es: "Planificado", fr: "Planifié", hi: "नियोजित",
    ja: "計画済み", ko: "계획됨", nl: "Gepland", pt: "Planejado", sw: "Imepangwa", tr: "Planlandı", zh: "已计划"
  },
  "logout": {
    ar: "تسجيل الخروج", de: "Abmelden", es: "Cerrar sesión", fr: "Déconnexion", hi: "लॉगआउट",
    ja: "ログアウト", ko: "로그아웃", nl: "Uitloggen", pt: "Sair", sw: "Toka", tr: "Çıkış", zh: "退出"
  },
  "preferences": {
    ar: "التفضيلات", de: "Einstellungen", es: "Preferencias", fr: "Préférences", hi: "प्राथमिकताएं",
    ja: "設定", ko: "환경설정", nl: "Voorkeuren", pt: "Preferências", sw: "Mapendeleo", tr: "Tercihler", zh: "偏好设置"
  },
  "step": {
    ar: "خطوة", de: "Schritt", es: "Paso", fr: "Étape", hi: "चरण",
    ja: "ステップ", ko: "단계", nl: "Stap", pt: "Passo", sw: "Hatua", tr: "Adım", zh: "步骤"
  },
  "carbs": {
    ar: "كربوهيدرات", de: "Kohlenhydrate", es: "Carbohidratos", fr: "Glucides", hi: "कार्ब्स",
    ja: "炭水化物", ko: "탄수화물", nl: "Koolhydraten", pt: "Carboidratos", sw: "Wanga", tr: "Karbonhidrat", zh: "碳水化合物"
  },
  "fat": {
    ar: "دهون", de: "Fett", es: "Grasa", fr: "Lipides", hi: "वसा",
    ja: "脂質", ko: "지방", nl: "Vet", pt: "Gordura", sw: "Mafuta", tr: "Yağ", zh: "脂肪"
  }
};

// Function to apply translations
function applyTranslations() {
  console.log('Applying ALL translations to language files...\n');

  const languages = ['ar', 'de', 'es', 'fr', 'hi', 'ja', 'ko', 'nl', 'pt', 'sw', 'tr', 'zh'];

  for (const lang of languages) {
    const filePath = path.join(TRANSLATIONS_DIR, `${lang}.json`);

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const translations = JSON.parse(content);

      let updated = 0;

      // Apply each translation
      for (const [key, langValues] of Object.entries(TRANSLATIONS)) {
        if (langValues[lang] && translations[key]) {
          // Only update if different
          if (translations[key] !== langValues[lang]) {
            translations[key] = langValues[lang];
            updated++;
          }
        }
      }

      // Sort keys alphabetically
      const sorted = {};
      Object.keys(translations).sort().forEach(k => {
        sorted[k] = translations[k];
      });

      // Write back
      fs.writeFileSync(filePath, JSON.stringify(sorted, null, 2) + '\n', 'utf8');

      console.log(`${lang}.json: ${updated} keys translated`);
    } catch (err) {
      console.error(`Error processing ${lang}.json:`, err.message);
    }
  }

  console.log('\nBase translations applied!');
  console.log('Note: This covers ~150 common keys. For full coverage, professional translation services are recommended.');
}

applyTranslations();
