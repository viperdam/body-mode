#!/usr/bin/env node

/**
 * Add translations for new i18n keys across all languages
 * This script updates the 18 new keys with proper translations
 */

const fs = require('fs');
const path = require('path');

const TRANSLATIONS_DIR = path.join(__dirname, '../src/i18n/translations');

// New keys with translations for all 13 languages
const NEW_TRANSLATIONS = {
  // Sleep quality keys
  "sleep.quality.excellent": {
    en: "Excellent",
    ar: "ممتاز",
    de: "Ausgezeichnet",
    es: "Excelente",
    fr: "Excellent",
    hi: "उत्कृष्ट",
    ja: "優秀",
    ko: "우수",
    nl: "Uitstekend",
    pt: "Excelente",
    sw: "Bora sana",
    tr: "Mükemmel",
    zh: "优秀"
  },
  "sleep.quality.good": {
    en: "Good",
    ar: "جيد",
    de: "Gut",
    es: "Bueno",
    fr: "Bon",
    hi: "अच्छा",
    ja: "良い",
    ko: "좋음",
    nl: "Goed",
    pt: "Bom",
    sw: "Nzuri",
    tr: "İyi",
    zh: "良好"
  },
  "sleep.quality.fair": {
    en: "Fair",
    ar: "مقبول",
    de: "Befriedigend",
    es: "Regular",
    fr: "Passable",
    hi: "ठीक",
    ja: "普通",
    ko: "보통",
    nl: "Redelijk",
    pt: "Regular",
    sw: "Wastani",
    tr: "Orta",
    zh: "一般"
  },
  "sleep.quality.poor": {
    en: "Poor",
    ar: "ضعيف",
    de: "Schlecht",
    es: "Malo",
    fr: "Mauvais",
    hi: "खराब",
    ja: "悪い",
    ko: "나쁨",
    nl: "Slecht",
    pt: "Ruim",
    sw: "Mbaya",
    tr: "Kötü",
    zh: "差"
  },

  // Overlay description keys
  "overlay.description.meal": {
    en: "Time for your scheduled meal. Staying on track!",
    ar: "حان وقت وجبتك المجدولة. استمر في المسار الصحيح!",
    de: "Zeit für deine geplante Mahlzeit. Bleib am Ball!",
    es: "Hora de tu comida programada. ¡Sigue en el camino!",
    fr: "C'est l'heure de votre repas prévu. Restez sur la bonne voie !",
    hi: "आपके निर्धारित भोजन का समय। ट्रैक पर बने रहें!",
    ja: "予定された食事の時間です。順調に進んでいます！",
    ko: "예정된 식사 시간입니다. 잘 하고 있어요!",
    nl: "Tijd voor je geplande maaltijd. Blijf op koers!",
    pt: "Hora da sua refeição programada. Continue no caminho certo!",
    sw: "Wakati wa mlo wako uliopangwa. Endelea vizuri!",
    tr: "Planlanmış öğün zamanı. Yolunda devam et!",
    zh: "您的预定用餐时间到了。继续保持！"
  },
  "overlay.description.hydration": {
    en: "Remember to drink water and stay hydrated.",
    ar: "تذكر أن تشرب الماء وتحافظ على رطوبتك.",
    de: "Denk daran, Wasser zu trinken und hydriert zu bleiben.",
    es: "Recuerda beber agua y mantenerte hidratado.",
    fr: "N'oubliez pas de boire de l'eau et de rester hydraté.",
    hi: "पानी पीना और हाइड्रेटेड रहना याद रखें।",
    ja: "水を飲んで水分補給を忘れずに。",
    ko: "물을 마시고 수분을 유지하세요.",
    nl: "Vergeet niet water te drinken en gehydrateerd te blijven.",
    pt: "Lembre-se de beber água e manter-se hidratado.",
    sw: "Kumbuka kunywa maji na kubaki na maji mwilini.",
    tr: "Su içmeyi ve sıvı dengenizi korumayı unutmayın.",
    zh: "记得喝水保持水分。"
  },
  "overlay.description.workout": {
    en: "Time to move! Your workout is scheduled now.",
    ar: "حان وقت الحركة! تمرينك مجدول الآن.",
    de: "Zeit, sich zu bewegen! Dein Training ist jetzt geplant.",
    es: "¡Hora de moverse! Tu entrenamiento está programado ahora.",
    fr: "C'est le moment de bouger ! Votre entraînement est prévu maintenant.",
    hi: "चलने का समय! आपकी कसरत अभी निर्धारित है।",
    ja: "体を動かす時間です！ワークアウトの予定です。",
    ko: "운동할 시간입니다! 지금 운동이 예정되어 있습니다.",
    nl: "Tijd om te bewegen! Je training staat nu gepland.",
    pt: "Hora de se mexer! Seu treino está agendado agora.",
    sw: "Wakati wa kusogea! Mazoezi yako yamepangwa sasa.",
    tr: "Hareket zamanı! Antrenmanın şimdi planlandı.",
    zh: "是时候运动了！您的锻炼已安排在现在。"
  },
  "overlay.description.sleep": {
    en: "Wind down time. Get ready for quality sleep.",
    ar: "وقت الاسترخاء. استعد لنوم جيد.",
    de: "Zeit zum Entspannen. Bereite dich auf erholsamen Schlaf vor.",
    es: "Hora de relajarse. Prepárate para un sueño de calidad.",
    fr: "C'est l'heure de se détendre. Préparez-vous pour un sommeil de qualité.",
    hi: "आराम का समय। गुणवत्तापूर्ण नींद के लिए तैयार हो जाएं।",
    ja: "リラックスタイム。質の良い睡眠の準備をしましょう。",
    ko: "휴식 시간입니다. 양질의 수면을 준비하세요.",
    nl: "Tijd om te ontspannen. Bereid je voor op een goede nachtrust.",
    pt: "Hora de relaxar. Prepare-se para um sono de qualidade.",
    sw: "Wakati wa kupumzika. Jiandae kwa usingizi bora.",
    tr: "Dinlenme zamanı. Kaliteli uyku için hazırlanın.",
    zh: "放松时间。为优质睡眠做好准备。"
  },
  "overlay.description.work_break": {
    en: "Take a short break. Stretch and refresh.",
    ar: "خذ استراحة قصيرة. تمدد وانتعش.",
    de: "Mach eine kurze Pause. Dehne dich und erfrische dich.",
    es: "Toma un breve descanso. Estírate y refréscate.",
    fr: "Prenez une courte pause. Étirez-vous et rafraîchissez-vous.",
    hi: "छोटा ब्रेक लें। स्ट्रेच करें और तरोताज़ा हों।",
    ja: "短い休憩を取りましょう。ストレッチしてリフレッシュ。",
    ko: "짧은 휴식을 취하세요. 스트레칭하고 기분을 전환하세요.",
    nl: "Neem een korte pauze. Rek je uit en verfris je.",
    pt: "Faça uma pequena pausa. Alongue-se e refresque-se.",
    sw: "Chukua mapumziko mafupi. Nyoosha na uburudike.",
    tr: "Kısa bir mola verin. Esneme yapın ve tazelenin.",
    zh: "休息一下。伸展放松一下。"
  },
  "overlay.description.default": {
    en: "You have a scheduled reminder.",
    ar: "لديك تذكير مجدول.",
    de: "Du hast eine geplante Erinnerung.",
    es: "Tienes un recordatorio programado.",
    fr: "Vous avez un rappel programmé.",
    hi: "आपके पास एक निर्धारित रिमाइंडर है।",
    ja: "スケジュールされたリマインダーがあります。",
    ko: "예정된 알림이 있습니다.",
    nl: "Je hebt een geplande herinnering.",
    pt: "Você tem um lembrete agendado.",
    sw: "Una ukumbusho uliopangwa.",
    tr: "Planlanmış bir hatırlatıcınız var.",
    zh: "您有一个预定的提醒。"
  },

  // Error keys - LLM
  "errors.llm.timeout": {
    en: "Request timed out. The AI is taking too long to respond.",
    ar: "انتهت مهلة الطلب. الذكاء الاصطناعي يستغرق وقتاً طويلاً للرد.",
    de: "Zeitüberschreitung der Anfrage. Die KI braucht zu lange zum Antworten.",
    es: "Tiempo de espera agotado. La IA está tardando demasiado en responder.",
    fr: "Délai d'attente dépassé. L'IA met trop de temps à répondre.",
    hi: "अनुरोध का समय समाप्त हो गया। AI को जवाब देने में बहुत समय लग रहा है।",
    ja: "リクエストがタイムアウトしました。AIの応答に時間がかかっています。",
    ko: "요청 시간이 초과되었습니다. AI 응답에 시간이 너무 오래 걸립니다.",
    nl: "Verzoek time-out. De AI doet er te lang over om te reageren.",
    pt: "Tempo esgotado. A IA está demorando muito para responder.",
    sw: "Muda wa ombi umekwisha. AI inachukua muda mrefu kujibu.",
    tr: "İstek zaman aşımına uğradı. Yapay zeka yanıt vermek için çok uzun sürüyor.",
    zh: "请求超时。AI响应时间过长。"
  },

  // Error keys - Video
  "errors.video.not_found": {
    en: "Video file not found for upload.",
    ar: "لم يتم العثور على ملف الفيديو للتحميل.",
    de: "Videodatei zum Hochladen nicht gefunden.",
    es: "Archivo de video no encontrado para subir.",
    fr: "Fichier vidéo introuvable pour le téléchargement.",
    hi: "अपलोड के लिए वीडियो फ़ाइल नहीं मिली।",
    ja: "アップロード用の動画ファイルが見つかりません。",
    ko: "업로드할 비디오 파일을 찾을 수 없습니다.",
    nl: "Videobestand niet gevonden voor upload.",
    pt: "Arquivo de vídeo não encontrado para upload.",
    sw: "Faili ya video haipatikani kwa kupakia.",
    tr: "Yüklenecek video dosyası bulunamadı.",
    zh: "找不到要上传的视频文件。"
  },
  "errors.video.too_large": {
    en: "Video is too large to upload. Please record a shorter clip and try again.",
    ar: "الفيديو كبير جداً للتحميل. يرجى تسجيل مقطع أقصر والمحاولة مرة أخرى.",
    de: "Video ist zu groß zum Hochladen. Bitte nimm einen kürzeren Clip auf und versuche es erneut.",
    es: "El video es demasiado grande para subir. Graba un clip más corto e intenta de nuevo.",
    fr: "La vidéo est trop volumineuse. Veuillez enregistrer un clip plus court et réessayer.",
    hi: "वीडियो अपलोड करने के लिए बहुत बड़ा है। कृपया छोटा क्लिप रिकॉर्ड करें और पुनः प्रयास करें।",
    ja: "動画が大きすぎてアップロードできません。短いクリップを録画して再試行してください。",
    ko: "비디오가 너무 커서 업로드할 수 없습니다. 짧은 클립을 녹화하고 다시 시도하세요.",
    nl: "Video is te groot om te uploaden. Neem een kortere clip op en probeer opnieuw.",
    pt: "O vídeo é muito grande para upload. Grave um clipe mais curto e tente novamente.",
    sw: "Video ni kubwa sana kupakia. Tafadhali rekodi klipu fupi na ujaribu tena.",
    tr: "Video yüklenemeyecek kadar büyük. Lütfen daha kısa bir klip kaydedin ve tekrar deneyin.",
    zh: "视频太大无法上传。请录制较短的片段后重试。"
  },
  "errors.video.too_large_processing": {
    en: "Video is too large for processing. Please record a shorter clip (under 15 seconds).",
    ar: "الفيديو كبير جداً للمعالجة. يرجى تسجيل مقطع أقصر (أقل من 15 ثانية).",
    de: "Video ist zu groß zur Verarbeitung. Bitte nimm einen kürzeren Clip auf (unter 15 Sekunden).",
    es: "El video es demasiado grande para procesar. Graba un clip más corto (menos de 15 segundos).",
    fr: "La vidéo est trop volumineuse pour le traitement. Veuillez enregistrer un clip plus court (moins de 15 secondes).",
    hi: "वीडियो प्रोसेसिंग के लिए बहुत बड़ा है। कृपया छोटा क्लिप रिकॉर्ड करें (15 सेकंड से कम)।",
    ja: "動画が大きすぎて処理できません。15秒以内の短いクリップを録画してください。",
    ko: "비디오가 처리하기에 너무 큽니다. 15초 미만의 짧은 클립을 녹화하세요.",
    nl: "Video is te groot voor verwerking. Neem een kortere clip op (minder dan 15 seconden).",
    pt: "O vídeo é muito grande para processar. Grave um clipe mais curto (menos de 15 segundos).",
    sw: "Video ni kubwa sana kwa usindikaji. Tafadhali rekodi klipu fupi (chini ya sekunde 15).",
    tr: "Video işlenemeyecek kadar büyük. Lütfen daha kısa bir klip kaydedin (15 saniyeden az).",
    zh: "视频太大无法处理。请录制较短的片段（15秒以内）。"
  },
  "errors.video.media_empty": {
    en: "Media data was empty after processing.",
    ar: "كانت بيانات الوسائط فارغة بعد المعالجة.",
    de: "Mediendaten waren nach der Verarbeitung leer.",
    es: "Los datos multimedia estaban vacíos después del procesamiento.",
    fr: "Les données média étaient vides après le traitement.",
    hi: "प्रोसेसिंग के बाद मीडिया डेटा खाली था।",
    ja: "処理後にメディアデータが空でした。",
    ko: "처리 후 미디어 데이터가 비어 있습니다.",
    nl: "Mediagegevens waren leeg na verwerking.",
    pt: "Os dados de mídia estavam vazios após o processamento.",
    sw: "Data ya media ilikuwa tupu baada ya usindikaji.",
    tr: "İşleme sonrasında medya verileri boştu.",
    zh: "处理后媒体数据为空。"
  },

  // Error keys - Cloud
  "errors.cloud.deletion_pending": {
    en: "Account deletion pending. Cloud sync is disabled.",
    ar: "حذف الحساب قيد الانتظار. تم تعطيل المزامنة السحابية.",
    de: "Kontolöschung ausstehend. Cloud-Synchronisierung ist deaktiviert.",
    es: "Eliminación de cuenta pendiente. La sincronización en la nube está desactivada.",
    fr: "Suppression du compte en attente. La synchronisation cloud est désactivée.",
    hi: "खाता हटाना लंबित है। क्लाउड सिंक अक्षम है।",
    ja: "アカウント削除保留中。クラウド同期は無効です。",
    ko: "계정 삭제 보류 중. 클라우드 동기화가 비활성화되었습니다.",
    nl: "Accountverwijdering in behandeling. Cloudsynchronisatie is uitgeschakeld.",
    pt: "Exclusão de conta pendente. A sincronização em nuvem está desativada.",
    sw: "Kufuta akaunti kunasubiri. Usawazishaji wa wingu umezimwa.",
    tr: "Hesap silme beklemede. Bulut senkronizasyonu devre dışı.",
    zh: "账户删除待处理。云同步已禁用。"
  },
  "errors.cloud.offline": {
    en: "Offline. Please connect to the internet and try again.",
    ar: "غير متصل. يرجى الاتصال بالإنترنت والمحاولة مرة أخرى.",
    de: "Offline. Bitte verbinde dich mit dem Internet und versuche es erneut.",
    es: "Sin conexión. Conéctate a internet e intenta de nuevo.",
    fr: "Hors ligne. Veuillez vous connecter à Internet et réessayer.",
    hi: "ऑफ़लाइन। कृपया इंटरनेट से कनेक्ट करें और पुनः प्रयास करें।",
    ja: "オフライン。インターネットに接続して再試行してください。",
    ko: "오프라인. 인터넷에 연결하고 다시 시도하세요.",
    nl: "Offline. Maak verbinding met internet en probeer opnieuw.",
    pt: "Offline. Conecte-se à internet e tente novamente.",
    sw: "Nje ya mtandao. Tafadhali unganisha na intaneti na ujaribu tena.",
    tr: "Çevrimdışı. Lütfen internete bağlanın ve tekrar deneyin.",
    zh: "离线。请连接互联网后重试。"
  },
  "errors.cloud.no_user": {
    en: "No authenticated user available.",
    ar: "لا يوجد مستخدم مصادق عليه متاح.",
    de: "Kein authentifizierter Benutzer verfügbar.",
    es: "No hay usuario autenticado disponible.",
    fr: "Aucun utilisateur authentifié disponible.",
    hi: "कोई प्रमाणित उपयोगकर्ता उपलब्ध नहीं है।",
    ja: "認証されたユーザーがいません。",
    ko: "인증된 사용자가 없습니다.",
    nl: "Geen geauthenticeerde gebruiker beschikbaar.",
    pt: "Nenhum usuário autenticado disponível.",
    sw: "Hakuna mtumiaji aliyethibitishwa anayepatikana.",
    tr: "Kimliği doğrulanmış kullanıcı bulunamadı.",
    zh: "没有可用的认证用户。"
  }
};

// Apply translations to all language files
function applyTranslations() {
  console.log('Applying translations to all language files...\n');

  const languages = ['ar', 'de', 'en', 'es', 'fr', 'hi', 'ja', 'ko', 'nl', 'pt', 'sw', 'tr', 'zh'];

  for (const lang of languages) {
    const filePath = path.join(TRANSLATIONS_DIR, `${lang}.json`);

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const translations = JSON.parse(content);

      let updated = 0;

      // Apply each new translation
      for (const [key, langValues] of Object.entries(NEW_TRANSLATIONS)) {
        if (langValues[lang]) {
          // Only update if different from current value (English placeholder)
          if (translations[key] !== langValues[lang]) {
            translations[key] = langValues[lang];
            updated++;
          }
        }
      }

      // Sort keys alphabetically
      const sorted = {};
      Object.keys(translations).sort().forEach(key => {
        sorted[key] = translations[key];
      });

      // Write back
      fs.writeFileSync(filePath, JSON.stringify(sorted, null, 2) + '\n', 'utf8');

      console.log(`${lang}.json: ${updated} translations updated`);
    } catch (err) {
      console.error(`Error processing ${lang}.json:`, err.message);
    }
  }

  console.log('\nTranslations applied successfully!');
}

applyTranslations();
