#!/usr/bin/env node
/**
 * Manual dashboard translations Part 3 - wrapup keys
 */

const fs = require('fs');
const path = require('path');

const TRANSLATIONS_DIR = path.join(__dirname, '../src/i18n/translations');

const DASHBOARD_TRANSLATIONS = {
  "dashboard.wrapup.calories_actual": {
    ar: "%{calories} سعرة",
    de: "%{calories} kcal",
    es: "%{calories} kcal",
    fr: "%{calories} kcal",
    hi: "%{calories} कैलोरी",
    ja: "%{calories} kcal",
    ko: "%{calories} kcal",
    nl: "%{calories} kcal",
    pt: "%{calories} kcal",
    sw: "%{calories} kcal",
    tr: "%{calories} kcal",
    zh: "%{calories} 卡路里"
  },
  "dashboard.wrapup.calories_planned": {
    ar: "~%{calories} سعرة",
    de: "~%{calories} kcal",
    es: "~%{calories} kcal",
    fr: "~%{calories} kcal",
    hi: "~%{calories} कैलोरी",
    ja: "~%{calories} kcal",
    ko: "~%{calories} kcal",
    nl: "~%{calories} kcal",
    pt: "~%{calories} kcal",
    sw: "~%{calories} kcal",
    tr: "~%{calories} kcal",
    zh: "约%{calories}卡路里"
  },
  "dashboard.wrapup.category.calories": {
    ar: "السعرات الحرارية",
    de: "Kalorien",
    es: "Calorías",
    fr: "Calories",
    hi: "कैलोरी",
    ja: "カロリー",
    ko: "칼로리",
    nl: "Calorieën",
    pt: "Calorias",
    sw: "Kalori",
    tr: "Kalori",
    zh: "热量"
  },
  "dashboard.wrapup.category.exercise": {
    ar: "التمارين",
    de: "Übung",
    es: "Ejercicio",
    fr: "Exercice",
    hi: "व्यायाम",
    ja: "運動",
    ko: "운동",
    nl: "Oefening",
    pt: "Exercício",
    sw: "Mazoezi",
    tr: "Egzersiz",
    zh: "运动"
  },
  "dashboard.wrapup.category.hydration": {
    ar: "الترطيب",
    de: "Flüssigkeit",
    es: "Hidratación",
    fr: "Hydratation",
    hi: "हाइड्रेशन",
    ja: "水分補給",
    ko: "수분 섭취",
    nl: "Hydratatie",
    pt: "Hidratação",
    sw: "Maji",
    tr: "Hidrasyon",
    zh: "补水"
  },
  "dashboard.wrapup.category.sleep": {
    ar: "النوم",
    de: "Schlaf",
    es: "Sueño",
    fr: "Sommeil",
    hi: "नींद",
    ja: "睡眠",
    ko: "수면",
    nl: "Slaap",
    pt: "Sono",
    sw: "Usingizi",
    tr: "Uyku",
    zh: "睡眠"
  },
  "dashboard.wrapup.category.tasks": {
    ar: "المهام",
    de: "Aufgaben",
    es: "Tareas",
    fr: "Tâches",
    hi: "कार्य",
    ja: "タスク",
    ko: "작업",
    nl: "Taken",
    pt: "Tarefas",
    sw: "Kazi",
    tr: "Görevler",
    zh: "任务"
  },
  "dashboard.wrapup.complete_title": {
    ar: "اكتمل اليوم!",
    de: "Tag abgeschlossen!",
    es: "¡Día completo!",
    fr: "Journée terminée !",
    hi: "दिन पूरा!",
    ja: "一日完了！",
    ko: "하루 완료!",
    nl: "Dag voltooid!",
    pt: "Dia completo!",
    sw: "Siku Imekamilika!",
    tr: "Gün Tamamlandı!",
    zh: "今日完成！"
  },
  "dashboard.wrapup.exercise_actual": {
    ar: "تم تسجيل %{count}",
    de: "%{count} protokolliert",
    es: "%{count} registrado",
    fr: "%{count} enregistré",
    hi: "%{count} लॉग किया गया",
    ja: "%{count} 記録済み",
    ko: "%{count} 기록됨",
    nl: "%{count} gelogd",
    pt: "%{count} registrado",
    sw: "%{count} imerekodiwa",
    tr: "%{count} kaydedildi",
    zh: "已记录 %{count}"
  },
  "dashboard.wrapup.exercise_planned": {
    ar: "%{count} جلسة%{suffix}",
    de: "%{count} Einheit%{suffix}",
    es: "%{count} sesión%{suffix}",
    fr: "%{count} séance%{suffix}",
    hi: "%{count} सत्र%{suffix}",
    ja: "%{count} セッション%{suffix}",
    ko: "%{count} 세션%{suffix}",
    nl: "%{count} sessie%{suffix}",
    pt: "%{count} sessão%{suffix}",
    sw: "%{count} kipindi%{suffix}",
    tr: "%{count} seans%{suffix}",
    zh: "%{count} 次训练%{suffix}"
  },
  "dashboard.wrapup.focus_improve": {
    ar: "ركز على إكمال المزيد من العناصر المخططة",
    de: "Konzentriere dich auf das Abschließen weiterer geplanter Punkte",
    es: "Enfócate en completar más elementos planificados",
    fr: "Concentrez-vous sur l'achèvement de plus d'éléments planifiés",
    hi: "अधिक नियोजित आइटम पूरा करने पर ध्यान दें",
    ja: "より多くの計画項目を完了することに集中",
    ko: "더 많은 계획된 항목 완료에 집중하세요",
    nl: "Focus op het voltooien van meer geplande items",
    pt: "Foque em completar mais itens planejados",
    sw: "Lenga kukamilisha vitu zaidi vilivyopangwa",
    tr: "Daha fazla planlanan öğeyi tamamlamaya odaklanın",
    zh: "专注于完成更多计划项目"
  },
  "dashboard.wrapup.focus_maintain": {
    ar: "حافظ على زخمك الرائع!",
    de: "Halte dein tolles Momentum!",
    es: "¡Mantén tu gran impulso!",
    fr: "Maintenez votre excellent élan !",
    hi: "अपनी शानदार गति बनाए रखें!",
    ja: "素晴らしい勢いを維持しましょう！",
    ko: "훌륭한 추진력을 유지하세요!",
    nl: "Houd je geweldige momentum vast!",
    pt: "Mantenha seu ótimo ritmo!",
    sw: "Endelea na kasi yako nzuri!",
    tr: "Harika momentumunuzu koruyun!",
    zh: "保持您的良好势头！"
  },
  "dashboard.wrapup.hydration_actual": {
    ar: "%{amount}مل",
    de: "%{amount}ml",
    es: "%{amount}ml",
    fr: "%{amount}ml",
    hi: "%{amount}मिली",
    ja: "%{amount}ml",
    ko: "%{amount}ml",
    nl: "%{amount}ml",
    pt: "%{amount}ml",
    sw: "%{amount}ml",
    tr: "%{amount}ml",
    zh: "%{amount}毫升"
  },
  "dashboard.wrapup.hydration_planned": {
    ar: "%{amount}مل",
    de: "%{amount}ml",
    es: "%{amount}ml",
    fr: "%{amount}ml",
    hi: "%{amount}मिली",
    ja: "%{amount}ml",
    ko: "%{amount}ml",
    nl: "%{amount}ml",
    pt: "%{amount}ml",
    sw: "%{amount}ml",
    tr: "%{amount}ml",
    zh: "%{amount}毫升"
  },
  "dashboard.wrapup.not_logged": {
    ar: "لم يتم التسجيل",
    de: "Nicht protokolliert",
    es: "No registrado",
    fr: "Non enregistré",
    hi: "लॉग नहीं किया गया",
    ja: "未記録",
    ko: "기록되지 않음",
    nl: "Niet gelogd",
    pt: "Não registrado",
    sw: "Haijarekodiwa",
    tr: "Kaydedilmedi",
    zh: "未记录"
  },
  "dashboard.wrapup.not_tracked": {
    ar: "لم يتم التتبع",
    de: "Nicht erfasst",
    es: "No rastreado",
    fr: "Non suivi",
    hi: "ट्रैक नहीं किया गया",
    ja: "未追跡",
    ko: "추적되지 않음",
    nl: "Niet gevolgd",
    pt: "Não rastreado",
    sw: "Haijafuatiliwa",
    tr: "Takip edilmedi",
    zh: "未追踪"
  },
  "dashboard.wrapup.plan_vs_reality": {
    ar: "الخطة مقابل الواقع",
    de: "Plan vs. Realität",
    es: "Plan vs Realidad",
    fr: "Plan vs Réalité",
    hi: "योजना बनाम वास्तविकता",
    ja: "計画 vs 現実",
    ko: "계획 vs 실제",
    nl: "Plan vs Werkelijkheid",
    pt: "Plano vs Realidade",
    sw: "Mpango dhidi ya Ukweli",
    tr: "Plan vs Gerçek",
    zh: "计划与实际"
  },
  "dashboard.wrapup.plan_vs_reality_subtitle": {
    ar: "إليك كيف كان أداؤك اليوم.",
    de: "So hast du heute abgeschnitten.",
    es: "Así es como lo hiciste hoy.",
    fr: "Voici comment vous avez fait aujourd'hui.",
    hi: "आज आपने कैसा प्रदर्शन किया।",
    ja: "今日の結果です。",
    ko: "오늘 어떻게 했는지 확인하세요.",
    nl: "Zo heb je het vandaag gedaan.",
    pt: "Veja como você se saiu hoje.",
    sw: "Hivi ndivyo ulivyofanya leo.",
    tr: "Bugün nasıl yaptığınız.",
    zh: "这是您今天的表现。"
  },
  "dashboard.wrapup.rating_subtitle": {
    ar: "قيّم يومك لإغلاق الحلقة.",
    de: "Bewerte deinen Tag zum Abschluss.",
    es: "Califica tu día para cerrar el ciclo.",
    fr: "Notez votre journée pour boucler la boucle.",
    hi: "चक्र पूरा करने के लिए अपने दिन को रेट करें।",
    ja: "一日を締めくくるために評価してください。",
    ko: "마무리를 위해 하루를 평가하세요.",
    nl: "Beoordeel je dag om af te sluiten.",
    pt: "Avalie seu dia para fechar o ciclo.",
    sw: "Kadiria siku yako kufunga mduara.",
    tr: "Döngüyü kapatmak için gününüzü değerlendirin.",
    zh: "评价您的一天以完成循环。"
  },
  "dashboard.wrapup.rating_title": {
    ar: "كيف تشعر؟",
    de: "Wie fühlst du dich?",
    es: "¿Cómo te sientes?",
    fr: "Comment vous sentez-vous ?",
    hi: "आप कैसा महसूस कर रहे हैं?",
    ja: "気分はどうですか？",
    ko: "기분이 어떠세요?",
    nl: "Hoe voel je je?",
    pt: "Como você se sente?",
    sw: "Unajisikiaje?",
    tr: "Nasıl hissediyorsunuz?",
    zh: "您感觉如何？"
  },
  "dashboard.wrapup.saved": {
    ar: "تم الحفظ!",
    de: "Gespeichert!",
    es: "¡Guardado!",
    fr: "Enregistré !",
    hi: "सहेजा गया!",
    ja: "保存完了！",
    ko: "저장됨!",
    nl: "Opgeslagen!",
    pt: "Salvo!",
    sw: "Imehifadhiwa!",
    tr: "Kaydedildi!",
    zh: "已保存！"
  },
  "dashboard.wrapup.see_details": {
    ar: "عرض التفاصيل →",
    de: "Details ansehen →",
    es: "Ver detalles →",
    fr: "Voir les détails →",
    hi: "विवरण देखें →",
    ja: "詳細を見る →",
    ko: "상세 보기 →",
    nl: "Details bekijken →",
    pt: "Ver detalhes →",
    sw: "Angalia Maelezo →",
    tr: "Ayrıntılara Bakın →",
    zh: "查看详情 →"
  },
  "dashboard.wrapup.sleep_actual": {
    ar: "%{hours}س",
    de: "%{hours}h",
    es: "%{hours}h",
    fr: "%{hours}h",
    hi: "%{hours}घंटे",
    ja: "%{hours}時間",
    ko: "%{hours}시간",
    nl: "%{hours}u",
    pt: "%{hours}h",
    sw: "%{hours}s",
    tr: "%{hours}s",
    zh: "%{hours}小时"
  },
  "dashboard.wrapup.sleep_planned": {
    ar: "%{hours}س",
    de: "%{hours}h",
    es: "%{hours}h",
    fr: "%{hours}h",
    hi: "%{hours}घंटे",
    ja: "%{hours}時間",
    ko: "%{hours}시간",
    nl: "%{hours}u",
    pt: "%{hours}h",
    sw: "%{hours}s",
    tr: "%{hours}s",
    zh: "%{hours}小时"
  },
  "dashboard.wrapup.summary.excellent_1": {
    ar: "يوم استثنائي!",
    de: "Herausragender Tag!",
    es: "¡Día excepcional!",
    fr: "Journée exceptionnelle !",
    hi: "शानदार दिन!",
    ja: "素晴らしい一日！",
    ko: "뛰어난 하루!",
    nl: "Uitstekende dag!",
    pt: "Dia excepcional!",
    sw: "Siku bora!",
    tr: "Olağanüstü gün!",
    zh: "出色的一天！"
  },
  "dashboard.wrapup.summary.excellent_2": {
    ar: "أنت رائع!",
    de: "Du hast es geschafft!",
    es: "¡Lo lograste!",
    fr: "Vous avez tout déchiré !",
    hi: "आपने कमाल किया!",
    ja: "やりました！",
    ko: "해냈어요!",
    nl: "Je hebt het gedaan!",
    pt: "Você arrasou!",
    sw: "Umefanya vizuri!",
    tr: "Harika başardınız!",
    zh: "您太棒了！"
  },
  "dashboard.wrapup.summary.excellent_3": {
    ar: "أداء في القمة!",
    de: "Spitzenleistung!",
    es: "¡Rendimiento máximo!",
    fr: "Performance au top !",
    hi: "शीर्ष प्रदर्शन!",
    ja: "最高のパフォーマンス！",
    ko: "최고의 성과!",
    nl: "Topprestatie!",
    pt: "Desempenho máximo!",
    sw: "Utendaji wa juu!",
    tr: "Zirve performansı!",
    zh: "巅峰表现！"
  },
  "dashboard.wrapup.summary.good_1": {
    ar: "تقدم قوي اليوم!",
    de: "Solider Fortschritt heute!",
    es: "¡Buen progreso hoy!",
    fr: "Bon progrès aujourd'hui !",
    hi: "आज अच्छी प्रगति!",
    ja: "今日も良い進捗！",
    ko: "오늘 좋은 진전!",
    nl: "Goede vooruitgang vandaag!",
    pt: "Bom progresso hoje!",
    sw: "Maendeleo mazuri leo!",
    tr: "Bugün iyi ilerleme!",
    zh: "今天进展良好！"
  },
  "dashboard.wrapup.summary.good_2": {
    ar: "جهد جيد!",
    de: "Gute Arbeit!",
    es: "¡Buen esfuerzo!",
    fr: "Bon effort !",
    hi: "अच्छा प्रयास!",
    ja: "よく頑張りました！",
    ko: "좋은 노력!",
    nl: "Goed gedaan!",
    pt: "Bom esforço!",
    sw: "Juhudi nzuri!",
    tr: "İyi çaba!",
    zh: "做得不错！"
  },
  "dashboard.wrapup.summary.good_3": {
    ar: "أحسنت!",
    de: "Gut gemacht!",
    es: "¡Bien hecho!",
    fr: "Bien joué !",
    hi: "बहुत बढ़िया!",
    ja: "よくできました！",
    ko: "잘했어요!",
    nl: "Goed gedaan!",
    pt: "Muito bem!",
    sw: "Umefanya vizuri!",
    tr: "Aferin!",
    zh: "做得好！"
  },
  "dashboard.wrapup.summary.low_1": {
    ar: "كان اليوم صعباً",
    de: "Heute war herausfordernd",
    es: "Hoy fue desafiante",
    fr: "Aujourd'hui était difficile",
    hi: "आज चुनौतीपूर्ण था",
    ja: "今日は大変でした",
    ko: "오늘은 어려웠어요",
    nl: "Vandaag was uitdagend",
    pt: "Hoje foi desafiador",
    sw: "Leo ilikuwa ngumu",
    tr: "Bugün zordu",
    zh: "今天很有挑战性"
  },
  "dashboard.wrapup.summary.low_2": {
    ar: "ابدأ جديداً غداً",
    de: "Morgen neu starten",
    es: "Empieza de nuevo mañana",
    fr: "Recommencez demain",
    hi: "कल नए सिरे से शुरू करें",
    ja: "明日は新たなスタート",
    ko: "내일 새롭게 시작하세요",
    nl: "Morgen opnieuw beginnen",
    pt: "Comece de novo amanhã",
    sw: "Anza upya kesho",
    tr: "Yarın yeniden başlayın",
    zh: "明天重新开始"
  },
  "dashboard.wrapup.summary.low_3": {
    ar: "كل يوم مهم",
    de: "Jeder Tag zählt",
    es: "Cada día cuenta",
    fr: "Chaque jour compte",
    hi: "हर दिन मायने रखता है",
    ja: "毎日が大切",
    ko: "매일이 중요해요",
    nl: "Elke dag telt",
    pt: "Todo dia conta",
    sw: "Kila siku ina umuhimu",
    tr: "Her gün önemli",
    zh: "每一天都很重要"
  },
  "dashboard.wrapup.summary.okay_1": {
    ar: "هناك مجال للتحسين",
    de: "Raum für Verbesserung",
    es: "Hay margen de mejora",
    fr: "Marge de progression",
    hi: "सुधार की गुंजाइश है",
    ja: "改善の余地あり",
    ko: "개선의 여지가 있어요",
    nl: "Ruimte voor verbetering",
    pt: "Há espaço para melhorar",
    sw: "Kuna nafasi ya kuboresha",
    tr: "İyileştirme için alan var",
    zh: "还有改进空间"
  },
  "dashboard.wrapup.summary.okay_2": {
    ar: "الغد فرصة جديدة",
    de: "Morgen ist eine neue Chance",
    es: "Mañana es una nueva oportunidad",
    fr: "Demain est une nouvelle chance",
    hi: "कल एक नया मौका है",
    ja: "明日は新しいチャンス",
    ko: "내일은 새로운 기회에요",
    nl: "Morgen is een nieuwe kans",
    pt: "Amanhã é uma nova chance",
    sw: "Kesho ni nafasi mpya",
    tr: "Yarın yeni bir fırsat",
    zh: "明天是新的机会"
  },
  "dashboard.wrapup.summary.okay_3": {
    ar: "استمر في المحاولة!",
    de: "Weitermachen!",
    es: "¡Sigue adelante!",
    fr: "Continuez !",
    hi: "प्रयास जारी रखें!",
    ja: "頑張り続けましょう！",
    ko: "계속 노력하세요!",
    nl: "Blijf doorgaan!",
    pt: "Continue tentando!",
    sw: "Endelea kujaribu!",
    tr: "Devam edin!",
    zh: "继续努力！"
  },
  "dashboard.wrapup.summary_focus_varied": {
    ar: "متنوع",
    de: "Vielfältig",
    es: "Variado",
    fr: "Varié",
    hi: "विविध",
    ja: "多様",
    ko: "다양함",
    nl: "Gevarieerd",
    pt: "Variado",
    sw: "Mbalimbali",
    tr: "Çeşitli",
    zh: "多样化"
  },
  "dashboard.wrapup.summary_line": {
    ar: "آخر التقييمات -> معدل AI: %{ai}، معدل المستخدم: %{user}. التركيز: %{focus}.",
    de: "Letzte Wrap-ups -> KI-Durchschnitt: %{ai}, Benutzer-Durchschnitt: %{user}. Fokus: %{focus}.",
    es: "Resúmenes recientes -> Promedio IA: %{ai}, promedio usuario: %{user}. Enfoque: %{focus}.",
    fr: "Bilans récents -> Moyenne IA : %{ai}, moyenne utilisateur : %{user}. Focus : %{focus}.",
    hi: "हाल के रैप-अप -> AI औसत: %{ai}, उपयोगकर्ता औसत: %{user}। फोकस: %{focus}।",
    ja: "最近のまとめ -> AI平均: %{ai}、ユーザー平均: %{user}。フォーカス: %{focus}。",
    ko: "최근 마무리 -> AI 평균: %{ai}, 사용자 평균: %{user}. 초점: %{focus}.",
    nl: "Recente wrap-ups -> AI gemiddelde: %{ai}, gebruiker gemiddelde: %{user}. Focus: %{focus}.",
    pt: "Resumos recentes -> Média IA: %{ai}, média usuário: %{user}. Foco: %{focus}.",
    sw: "Muhtasari wa hivi karibuni -> Wastani wa AI: %{ai}, wastani wa mtumiaji: %{user}. Lengo: %{focus}.",
    tr: "Son özetler -> AI ortalaması: %{ai}, kullanıcı ortalaması: %{user}. Odak: %{focus}.",
    zh: "最近总结 -> AI平均: %{ai}，用户平均: %{user}。重点: %{focus}。"
  },
  "dashboard.wrapup.tasks_actual": {
    ar: "%{completed} مكتمل، %{skipped} تم تخطيه",
    de: "%{completed} erledigt, %{skipped} übersprungen",
    es: "%{completed} hecho, %{skipped} omitido",
    fr: "%{completed} fait, %{skipped} ignoré",
    hi: "%{completed} पूर्ण, %{skipped} छोड़ा गया",
    ja: "%{completed} 完了, %{skipped} スキップ",
    ko: "%{completed} 완료, %{skipped} 건너뜀",
    nl: "%{completed} klaar, %{skipped} overgeslagen",
    pt: "%{completed} feito, %{skipped} pulado",
    sw: "%{completed} imekamilika, %{skipped} imerukwa",
    tr: "%{completed} tamamlandı, %{skipped} atlandı",
    zh: "%{completed} 已完成, %{skipped} 已跳过"
  },
  "dashboard.wrapup.tasks_planned": {
    ar: "%{count} مخطط",
    de: "%{count} geplant",
    es: "%{count} planificado",
    fr: "%{count} planifié",
    hi: "%{count} नियोजित",
    ja: "%{count} 計画済み",
    ko: "%{count} 계획됨",
    nl: "%{count} gepland",
    pt: "%{count} planejado",
    sw: "%{count} imepangwa",
    tr: "%{count} planlandı",
    zh: "%{count} 已计划"
  },
  "dashboard.wrapup.tomorrow_focus": {
    ar: "تركيز الغد",
    de: "FOKUS FÜR MORGEN",
    es: "ENFOQUE DE MAÑANA",
    fr: "OBJECTIF DE DEMAIN",
    hi: "कल का फोकस",
    ja: "明日のフォーカス",
    ko: "내일의 초점",
    nl: "FOCUS VOOR MORGEN",
    pt: "FOCO DE AMANHÃ",
    sw: "LENGO LA KESHO",
    tr: "YARININ ODAĞI",
    zh: "明天的重点"
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

    for (const [key, langTranslations] of Object.entries(DASHBOARD_TRANSLATIONS)) {
      if (langTranslations[lang] && translations[key] === en[key]) {
        translations[key] = langTranslations[lang];
        updated++;
      }
    }

    writeJsonSorted(filePath, translations);
    console.log(`[dashboard-3] ${lang}: ${updated} keys updated`);
  }

  console.log('[dashboard-3] Wrapup keys complete');
};

main();
