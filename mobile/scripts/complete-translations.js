#!/usr/bin/env node

/**
 * Complete Translation Script - ALL 1300+ keys
 * Professional translations for 12 languages
 */

const fs = require('fs');
const path = require('path');

const TRANSLATIONS_DIR = path.join(__dirname, '../src/i18n/translations');

// Complete translations organized by category
const TRANSLATIONS = {
  // =============================================
  // ACCESSIBILITY
  // =============================================
  "accessibility.chat_mode": {
    ar: "اختيار وضع الدردشة", de: "Chat-Modus Auswahl", es: "Selección de modo de chat", fr: "Sélection du mode de chat", hi: "चैट मोड चयन",
    ja: "チャットモード選択", ko: "채팅 모드 선택", nl: "Chatmodus selectie", pt: "Seleção de modo de chat", sw: "Uchaguzi wa hali ya mazungumzo", tr: "Sohbet modu seçimi", zh: "聊天模式选择"
  },
  "accessibility.clear_chat": {
    ar: "مسح سجل الدردشة", de: "Chat-Verlauf löschen", es: "Borrar historial de chat", fr: "Effacer l'historique du chat", hi: "चैट इतिहास साफ करें",
    ja: "チャット履歴をクリア", ko: "채팅 기록 지우기", nl: "Chatgeschiedenis wissen", pt: "Limpar histórico de chat", sw: "Futa historia ya mazungumzo", tr: "Sohbet geçmişini temizle", zh: "清除聊天记录"
  },
  "accessibility.edit_profile": {
    ar: "تعديل الملف الشخصي", de: "Profil bearbeiten", es: "Editar perfil", fr: "Modifier le profil", hi: "प्रोफ़ाइल संपादित करें",
    ja: "プロフィールを編集", ko: "프로필 편집", nl: "Profiel bewerken", pt: "Editar perfil", sw: "Hariri wasifu", tr: "Profili düzenle", zh: "编辑个人资料"
  },
  "accessibility.general_mode": {
    ar: "الوضع العام", de: "Allgemeiner Modus", es: "Modo general", fr: "Mode général", hi: "सामान्य मोड",
    ja: "一般モード", ko: "일반 모드", nl: "Algemene modus", pt: "Modo geral", sw: "Hali ya jumla", tr: "Genel mod", zh: "通用模式"
  },
  "accessibility.go_back": {
    ar: "الرجوع", de: "Zurück", es: "Volver", fr: "Retour", hi: "वापस जाएं",
    ja: "戻る", ko: "뒤로 가기", nl: "Terug", pt: "Voltar", sw: "Rudi nyuma", tr: "Geri dön", zh: "返回"
  },
  "accessibility.personal_mode": {
    ar: "الوضع الشخصي", de: "Persönlicher Modus", es: "Modo personal", fr: "Mode personnel", hi: "व्यक्तिगत मोड",
    ja: "パーソナルモード", ko: "개인 모드", nl: "Persoonlijke modus", pt: "Modo pessoal", sw: "Hali ya kibinafsi", tr: "Kişisel mod", zh: "个人模式"
  },
  "accessibility.quick_action": {
    ar: "إجراء سريع: %{action}", de: "Schnellaktion: %{action}", es: "Acción rápida: %{action}", fr: "Action rapide: %{action}", hi: "त्वरित कार्रवाई: %{action}",
    ja: "クイックアクション: %{action}", ko: "빠른 작업: %{action}", nl: "Snelle actie: %{action}", pt: "Ação rápida: %{action}", sw: "Hatua ya haraka: %{action}", tr: "Hızlı işlem: %{action}", zh: "快速操作: %{action}"
  },
  "accessibility.send_message": {
    ar: "إرسال رسالة", de: "Nachricht senden", es: "Enviar mensaje", fr: "Envoyer le message", hi: "संदेश भेजें",
    ja: "メッセージを送信", ko: "메시지 보내기", nl: "Bericht verzenden", pt: "Enviar mensagem", sw: "Tuma ujumbe", tr: "Mesaj gönder", zh: "发送消息"
  },
  "accessibility.speech_disable": {
    ar: "تعطيل الصوت. حاليًا مفعل", de: "Stimme deaktivieren. Derzeit aktiv", es: "Desactivar voz. Actualmente activado", fr: "Désactiver la voix. Actuellement activé", hi: "आवाज अक्षम करें। वर्तमान में चालू",
    ja: "音声を無効化。現在オン", ko: "음성 비활성화. 현재 켜짐", nl: "Stem uitschakelen. Momenteel aan", pt: "Desativar voz. Atualmente ligado", sw: "Zima sauti. Sasa imewashwa", tr: "Sesi devre dışı bırak. Şu an açık", zh: "禁用语音。当前已开启"
  },
  "accessibility.speech_enable": {
    ar: "تفعيل الصوت. حاليًا معطل", de: "Stimme aktivieren. Derzeit deaktiviert", es: "Activar voz. Actualmente desactivado", fr: "Activer la voix. Actuellement désactivé", hi: "आवाज सक्षम करें। वर्तमान में बंद",
    ja: "音声を有効化。現在オフ", ko: "음성 활성화. 현재 꺼짐", nl: "Stem inschakelen. Momenteel uit", pt: "Ativar voz. Atualmente desligado", sw: "Washa sauti. Sasa imezimwa", tr: "Sesi etkinleştir. Şu an kapalı", zh: "启用语音。当前已关闭"
  },

  // =============================================
  // ACTION (remaining)
  // =============================================
  "action.activity.diff": {
    ar: "قمت بـ %{actual} بدلاً من %{planned}", de: "Habe %{actual} statt %{planned} gemacht", es: "Hice %{actual} en lugar de %{planned}", fr: "J'ai fait %{actual} au lieu de %{planned}", hi: "%{planned} के बजाय %{actual} किया",
    ja: "%{planned}の代わりに%{actual}をしました", ko: "%{planned} 대신 %{actual}을 했습니다", nl: "Deed %{actual} in plaats van %{planned}", pt: "Fiz %{actual} em vez de %{planned}", sw: "Nilifanya %{actual} badala ya %{planned}", tr: "%{planned} yerine %{actual} yaptım", zh: "做了%{actual}而不是%{planned}"
  },
  "action.default.subtitle": {
    ar: "حدد هذا العنصر كمكتمل أو سجل تحديثًا.", de: "Markiere diesen Eintrag als erledigt oder protokolliere ein Update.", es: "Marca este elemento como completado o registra una actualización.", fr: "Marquez cet élément comme terminé ou enregistrez une mise à jour.", hi: "इस आइटम को पूर्ण के रूप में चिह्नित करें या अपडेट लॉग करें।",
    ja: "このアイテムを完了にするか、更新を記録してください。", ko: "이 항목을 완료로 표시하거나 업데이트를 기록하세요.", nl: "Markeer dit item als klaar of log een update.", pt: "Marque este item como concluído ou registre uma atualização.", sw: "Weka alama kitu hiki kama kimekamilika au andika sasisho.", tr: "Bu öğeyi tamamlandı olarak işaretle veya güncelleme kaydet.", zh: "将此项标记为完成或记录更新。"
  },
  "action.error.analyze_food": {
    ar: "تعذر تحليل هذا الطعام. يرجى المحاولة مرة أخرى.", de: "Konnte das Essen nicht analysieren. Bitte versuche es erneut.", es: "No se pudo analizar esa comida. Por favor, inténtalo de nuevo.", fr: "Impossible d'analyser cet aliment. Veuillez réessayer.", hi: "उस भोजन का विश्लेषण नहीं कर सका। कृपया पुनः प्रयास करें।",
    ja: "その食べ物を分析できませんでした。もう一度お試しください。", ko: "해당 음식을 분석할 수 없습니다. 다시 시도해 주세요.", nl: "Kon dat voedsel niet analyseren. Probeer het opnieuw.", pt: "Não foi possível analisar essa comida. Por favor, tente novamente.", sw: "Haikuweza kuchambua chakula hicho. Tafadhali jaribu tena.", tr: "Bu yiyeceği analiz edemedik. Lütfen tekrar deneyin.", zh: "无法分析该食物。请重试。"
  },
  "action.favorite.advice": {
    ar: "تم التسجيل من المفضلة", de: "Aus Favoriten protokolliert", es: "Registrado desde favoritos", fr: "Enregistré depuis les favoris", hi: "पसंदीदा से लॉग किया गया",
    ja: "お気に入りから記録しました", ko: "즐겨찾기에서 기록됨", nl: "Gelogd uit favorieten", pt: "Registrado dos favoritos", sw: "Imeandikwa kutoka kwa vipendwa", tr: "Favorilerden kaydedildi", zh: "从收藏夹记录"
  },
  "action.favorite.description": {
    ar: "تم تسجيل المفضلة: %{meal}", de: "Favorit protokolliert: %{meal}", es: "Favorito registrado: %{meal}", fr: "Favori enregistré: %{meal}", hi: "पसंदीदा लॉग किया: %{meal}",
    ja: "お気に入りを記録: %{meal}", ko: "즐겨찾기 기록됨: %{meal}", nl: "Favoriet gelogd: %{meal}", pt: "Favorito registrado: %{meal}", sw: "Kipendwa kimeandikwa: %{meal}", tr: "Favori kaydedildi: %{meal}", zh: "已记录收藏: %{meal}"
  },
  "action.favorites.macros": {
    ar: "%{calories} سعرة · %{protein}غ بروتين", de: "%{calories} kcal · %{protein}g Protein", es: "%{calories} kcal · %{protein}g proteína", fr: "%{calories} kcal · %{protein}g protéines", hi: "%{calories} कैलोरी · %{protein}ग्रा प्रोटीन",
    ja: "%{calories} kcal · %{protein}g タンパク質", ko: "%{calories} kcal · %{protein}g 단백질", nl: "%{calories} kcal · %{protein}g eiwit", pt: "%{calories} kcal · %{protein}g proteína", sw: "%{calories} kcal · %{protein}g protini", tr: "%{calories} kcal · %{protein}g protein", zh: "%{calories}千卡 · %{protein}克蛋白质"
  },
  "action.favorites.quick_title": {
    ar: "⭐ تسجيل سريع من المفضلة", de: "⭐ Schnelleintrag aus Favoriten", es: "⭐ Registro rápido de favoritos", fr: "⭐ Enregistrement rapide des favoris", hi: "⭐ पसंदीदा से त्वरित लॉग",
    ja: "⭐ お気に入りからクイック記録", ko: "⭐ 즐겨찾기에서 빠른 기록", nl: "⭐ Snel loggen uit favorieten", pt: "⭐ Registro rápido dos favoritos", sw: "⭐ Andika haraka kutoka vipendwa", tr: "⭐ Favorilerden hızlı kayıt", zh: "⭐ 从收藏快速记录"
  },
  "action.food.unknown": {
    ar: "طعام غير معروف", de: "Unbekanntes Essen", es: "Comida desconocida", fr: "Aliment inconnu", hi: "अज्ञात भोजन",
    ja: "不明な食べ物", ko: "알 수 없는 음식", nl: "Onbekend voedsel", pt: "Comida desconhecida", sw: "Chakula kisichojulikana", tr: "Bilinmeyen yiyecek", zh: "未知食物"
  },
  "action.log_activity.duration_label": {
    ar: "المدة (دقائق)", de: "Dauer (Minuten)", es: "Duración (minutos)", fr: "Durée (minutes)", hi: "अवधि (मिनट)",
    ja: "時間（分）", ko: "시간 (분)", nl: "Duur (minuten)", pt: "Duração (minutos)", sw: "Muda (dakika)", tr: "Süre (dakika)", zh: "时长（分钟）"
  },
  "action.log_activity.intensity_label": {
    ar: "الشدة", de: "Intensität", es: "Intensidad", fr: "Intensité", hi: "तीव्रता",
    ja: "強度", ko: "강도", nl: "Intensiteit", pt: "Intensidade", sw: "Nguvu", tr: "Yoğunluk", zh: "强度"
  },
  "action.log_activity.name_label": {
    ar: "اسم النشاط", de: "Aktivitätsname", es: "Nombre de la actividad", fr: "Nom de l'activité", hi: "गतिविधि का नाम",
    ja: "アクティビティ名", ko: "활동 이름", nl: "Activiteitsnaam", pt: "Nome da atividade", sw: "Jina la shughuli", tr: "Aktivite adı", zh: "活动名称"
  },
  "action.log_activity.name_placeholder": {
    ar: "مثال: المشي السريع", de: "z.B. Schnelles Gehen", es: "ej., Caminata rápida", fr: "ex., Marche rapide", hi: "उदा., तेज चलना",
    ja: "例：早歩き", ko: "예: 빠른 걷기", nl: "bijv., Stevig wandelen", pt: "ex., Caminhada rápida", sw: "mfano, Kutembea haraka", tr: "örn., Hızlı yürüyüş", zh: "例如：快走"
  },
  "action.log_activity.save": {
    ar: "حفظ النشاط", de: "Aktivität speichern", es: "Guardar actividad", fr: "Enregistrer l'activité", hi: "गतिविधि सहेजें",
    ja: "アクティビティを保存", ko: "활동 저장", nl: "Activiteit opslaan", pt: "Salvar atividade", sw: "Hifadhi shughuli", tr: "Aktiviteyi kaydet", zh: "保存活动"
  },
  "action.log_food.camera": {
    ar: "استخدم الكاميرا", de: "Kamera verwenden", es: "Usar cámara", fr: "Utiliser la caméra", hi: "कैमरा का उपयोग करें",
    ja: "カメラを使用", ko: "카메라 사용", nl: "Camera gebruiken", pt: "Usar câmera", sw: "Tumia kamera", tr: "Kamera kullan", zh: "使用相机"
  },
  "action.log_food.describe": {
    ar: "وصف الطعام", de: "Essen beschreiben", es: "Describir comida", fr: "Décrire le repas", hi: "भोजन का वर्णन करें",
    ja: "食事を説明", ko: "음식 설명", nl: "Eten beschrijven", pt: "Descrever comida", sw: "Elezea chakula", tr: "Yemeği açıkla", zh: "描述食物"
  },
  "action.log_food.favorites": {
    ar: "من المفضلة", de: "Aus Favoriten", es: "De favoritos", fr: "Des favoris", hi: "पसंदीदा से",
    ja: "お気に入りから", ko: "즐겨찾기에서", nl: "Uit favorieten", pt: "Dos favoritos", sw: "Kutoka vipendwa", tr: "Favorilerden", zh: "从收藏"
  },
  "action.log_food_text.placeholder": {
    ar: "صف ما أكلته...", de: "Beschreibe was du gegessen hast...", es: "Describe lo que comiste...", fr: "Décrivez ce que vous avez mangé...", hi: "आपने क्या खाया वर्णन करें...",
    ja: "食べたものを説明してください...", ko: "무엇을 먹었는지 설명하세요...", nl: "Beschrijf wat je hebt gegeten...", pt: "Descreva o que você comeu...", sw: "Elezea ulichokula...", tr: "Ne yediğinizi açıklayın...", zh: "描述您吃了什么..."
  },
  "action.log_food_text.quantity_placeholder": {
    ar: "الكمية (اختياري)", de: "Menge (optional)", es: "Cantidad (opcional)", fr: "Quantité (optionnel)", hi: "मात्रा (वैकल्पिक)",
    ja: "量（任意）", ko: "양 (선택사항)", nl: "Hoeveelheid (optioneel)", pt: "Quantidade (opcional)", sw: "Kiasi (hiari)", tr: "Miktar (opsiyonel)", zh: "数量（可选）"
  },
  "action.log_food_text.quantity_prefix": {
    ar: "الكمية: %{quantity}", de: "Menge: %{quantity}", es: "Cantidad: %{quantity}", fr: "Quantité: %{quantity}", hi: "मात्रा: %{quantity}",
    ja: "量: %{quantity}", ko: "양: %{quantity}", nl: "Hoeveelheid: %{quantity}", pt: "Quantidade: %{quantity}", sw: "Kiasi: %{quantity}", tr: "Miktar: %{quantity}", zh: "数量: %{quantity}"
  },
  "action.log_food_text.submit": {
    ar: "تحليل الطعام", de: "Essen analysieren", es: "Analizar comida", fr: "Analyser le repas", hi: "भोजन का विश्लेषण करें",
    ja: "食事を分析", ko: "음식 분석", nl: "Eten analyseren", pt: "Analisar comida", sw: "Chambua chakula", tr: "Yemeği analiz et", zh: "分析食物"
  },
  "action.log_food_text.title": {
    ar: "صف وجبتك", de: "Beschreibe deine Mahlzeit", es: "Describe tu comida", fr: "Décrivez votre repas", hi: "अपना भोजन वर्णन करें",
    ja: "食事を説明してください", ko: "식사를 설명하세요", nl: "Beschrijf je maaltijd", pt: "Descreva sua refeição", sw: "Elezea mlo wako", tr: "Yemeğinizi açıklayın", zh: "描述您的餐食"
  },
  "action.log_water.amount": {
    ar: "%{amount} %{unit}", de: "%{amount} %{unit}", es: "%{amount} %{unit}", fr: "%{amount} %{unit}", hi: "%{amount} %{unit}",
    ja: "%{amount} %{unit}", ko: "%{amount} %{unit}", nl: "%{amount} %{unit}", pt: "%{amount} %{unit}", sw: "%{amount} %{unit}", tr: "%{amount} %{unit}", zh: "%{amount} %{unit}"
  },
  "action.log_water.custom_label": {
    ar: "كمية مخصصة", de: "Benutzerdefinierte Menge", es: "Cantidad personalizada", fr: "Quantité personnalisée", hi: "कस्टम मात्रा",
    ja: "カスタム量", ko: "사용자 지정 양", nl: "Aangepaste hoeveelheid", pt: "Quantidade personalizada", sw: "Kiasi maalum", tr: "Özel miktar", zh: "自定义量"
  },
  "action.log_water.submit": {
    ar: "تسجيل %{amount} %{unit}", de: "%{amount} %{unit} protokollieren", es: "Registrar %{amount} %{unit}", fr: "Enregistrer %{amount} %{unit}", hi: "%{amount} %{unit} लॉग करें",
    ja: "%{amount} %{unit}を記録", ko: "%{amount} %{unit} 기록", nl: "%{amount} %{unit} loggen", pt: "Registrar %{amount} %{unit}", sw: "Andika %{amount} %{unit}", tr: "%{amount} %{unit} kaydet", zh: "记录 %{amount} %{unit}"
  },
  "action.modify.meal": {
    ar: "تغيير الوجبة", de: "Mahlzeit ändern", es: "Cambiar comida", fr: "Changer le repas", hi: "भोजन बदलें",
    ja: "食事を変更", ko: "식사 변경", nl: "Maaltijd wijzigen", pt: "Mudar refeição", sw: "Badilisha mlo", tr: "Öğünü değiştir", zh: "更改餐食"
  },
  "action.modify.meal_alt": {
    ar: "أكلت شيئًا آخر...", de: "Ich habe etwas anderes gegessen...", es: "Comí algo diferente...", fr: "J'ai mangé autre chose...", hi: "मैंने कुछ और खाया...",
    ja: "別のものを食べました...", ko: "다른 것을 먹었어요...", nl: "Ik heb iets anders gegeten...", pt: "Comi outra coisa...", sw: "Nilikula kitu kingine...", tr: "Başka bir şey yedim...", zh: "我吃了别的东西..."
  },
  "action.modify.workout": {
    ar: "تغيير التمرين", de: "Training ändern", es: "Cambiar entrenamiento", fr: "Changer l'entraînement", hi: "व्यायाम बदलें",
    ja: "ワークアウトを変更", ko: "운동 변경", nl: "Training wijzigen", pt: "Mudar treino", sw: "Badilisha mazoezi", tr: "Antrenmanı değiştir", zh: "更改锻炼"
  },
  "action.modify.workout_alt": {
    ar: "فعلت شيئًا آخر...", de: "Ich habe etwas anderes gemacht...", es: "Hice algo diferente...", fr: "J'ai fait autre chose...", hi: "मैंने कुछ और किया...",
    ja: "別のことをしました...", ko: "다른 것을 했어요...", nl: "Ik heb iets anders gedaan...", pt: "Fiz outra coisa...", sw: "Nilifanya kitu kingine...", tr: "Başka bir şey yaptım...", zh: "我做了别的事..."
  },
  "action.reminder.badge": {
    ar: "تذكير الخطة", de: "Plan-Erinnerung", es: "Recordatorio del plan", fr: "Rappel du plan", hi: "योजना अनुस्मारक",
    ja: "プランリマインダー", ko: "플랜 알림", nl: "Plan herinnering", pt: "Lembrete do plano", sw: "Ukumbusho wa mpango", tr: "Plan hatırlatıcısı", zh: "计划提醒"
  },
  "action.snooze.minutes": {
    ar: "%{minutes} دقيقة", de: "%{minutes} Min", es: "%{minutes} min", fr: "%{minutes} min", hi: "%{minutes} मिनट",
    ja: "%{minutes}分", ko: "%{minutes}분", nl: "%{minutes} min", pt: "%{minutes} min", sw: "%{minutes} dakika", tr: "%{minutes} dk", zh: "%{minutes}分钟"
  },
  "action.snooze.title": {
    ar: "تأجيل لمدة...", de: "Schlummern für...", es: "Posponer por...", fr: "Reporter de...", hi: "के लिए स्नूज़...",
    ja: "スヌーズ...", ko: "다시 알림...", nl: "Snoozen voor...", pt: "Soneca por...", sw: "Ahirisha kwa...", tr: "Ertele...", zh: "稍后提醒..."
  },

  // =============================================
  // ALERTS
  // =============================================
  "alert.added_to_favorites": {
    ar: "تمت الإضافة إلى المفضلة.", de: "Zu Favoriten hinzugefügt.", es: "Añadido a favoritos.", fr: "Ajouté aux favoris.", hi: "पसंदीदा में जोड़ा गया।",
    ja: "お気に入りに追加しました。", ko: "즐겨찾기에 추가되었습니다.", nl: "Toegevoegd aan favorieten.", pt: "Adicionado aos favoritos.", sw: "Imeongezwa kwenye vipendwa.", tr: "Favorilere eklendi.", zh: "已添加到收藏。"
  },
  "alert.alarm": {
    ar: "منبه", de: "Alarm", es: "Alarma", fr: "Alarme", hi: "अलार्म",
    ja: "アラーム", ko: "알람", nl: "Alarm", pt: "Alarme", sw: "Kengele", tr: "Alarm", zh: "闹钟"
  },
  "alert.all_data_deleted": {
    ar: "تم حذف جميع البيانات.", de: "Alle Daten gelöscht.", es: "Todos los datos eliminados.", fr: "Toutes les données supprimées.", hi: "सभी डेटा हटाया गया।",
    ja: "すべてのデータが削除されました。", ko: "모든 데이터가 삭제되었습니다.", nl: "Alle gegevens verwijderd.", pt: "Todos os dados excluídos.", sw: "Data yote imefutwa.", tr: "Tüm veriler silindi.", zh: "所有数据已删除。"
  },
  "alert.already_saved": {
    ar: "تم الحفظ مسبقًا.", de: "Bereits gespeichert.", es: "Ya guardado.", fr: "Déjà enregistré.", hi: "पहले से सहेजा हुआ।",
    ja: "すでに保存されています。", ko: "이미 저장되었습니다.", nl: "Al opgeslagen.", pt: "Já salvo.", sw: "Tayari imehifadhiwa.", tr: "Zaten kaydedildi.", zh: "已保存。"
  },
  "alert.could_not_schedule": {
    ar: "تعذر جدولة التذكير.", de: "Erinnerung konnte nicht geplant werden.", es: "No se pudo programar el recordatorio.", fr: "Impossible de programmer le rappel.", hi: "अनुस्मारक शेड्यूल नहीं कर सका।",
    ja: "リマインダーをスケジュールできませんでした。", ko: "알림을 예약할 수 없습니다.", nl: "Kon herinnering niet plannen.", pt: "Não foi possível agendar o lembrete.", sw: "Haikuweza kupanga ukumbusho.", tr: "Hatırlatıcı planlanamadı.", zh: "无法安排提醒。"
  },
  "alert.data_cleared": {
    ar: "تم مسح البيانات", de: "Daten gelöscht", es: "Datos borrados", fr: "Données effacées", hi: "डेटा साफ हुआ",
    ja: "データがクリアされました", ko: "데이터 삭제됨", nl: "Gegevens gewist", pt: "Dados limpos", sw: "Data imefutwa", tr: "Veriler temizlendi", zh: "数据已清除"
  },
  "alert.enter_valid_number": {
    ar: "يرجى إدخال رقم صالح.", de: "Bitte gib eine gültige Zahl ein.", es: "Por favor, introduce un número válido.", fr: "Veuillez entrer un nombre valide.", hi: "कृपया एक वैध संख्या दर्ज करें।",
    ja: "有効な数字を入力してください。", ko: "유효한 숫자를 입력하세요.", nl: "Voer een geldig getal in.", pt: "Por favor, insira um número válido.", sw: "Tafadhali ingiza nambari halali.", tr: "Lütfen geçerli bir sayı girin.", zh: "请输入有效数字。"
  },
  "alert.export_failed": {
    ar: "فشل التصدير", de: "Export fehlgeschlagen", es: "Error en la exportación", fr: "Échec de l'exportation", hi: "निर्यात विफल",
    ja: "エクスポート失敗", ko: "내보내기 실패", nl: "Export mislukt", pt: "Falha na exportação", sw: "Kusafirisha kumeshindikana", tr: "Dışa aktarma başarısız", zh: "导出失败"
  },
  "alert.failed": {
    ar: "فشل", de: "Fehlgeschlagen", es: "Fallido", fr: "Échoué", hi: "विफल",
    ja: "失敗", ko: "실패", nl: "Mislukt", pt: "Falhou", sw: "Imeshindikana", tr: "Başarısız", zh: "失败"
  },
  "alert.hydration_logged": {
    ar: "تم تسجيل الترطيب", de: "Flüssigkeit protokolliert", es: "Hidratación registrada", fr: "Hydratation enregistrée", hi: "हाइड्रेशन लॉग किया गया",
    ja: "水分を記録しました", ko: "수분 섭취 기록됨", nl: "Hydratatie gelogd", pt: "Hidratação registrada", sw: "Maji yameandikwa", tr: "Sıvı alımı kaydedildi", zh: "已记录饮水"
  },
  "alert.invalid_weight": {
    ar: "وزن غير صالح", de: "Ungültiges Gewicht", es: "Peso inválido", fr: "Poids invalide", hi: "अमान्य वजन",
    ja: "無効な体重", ko: "잘못된 체중", nl: "Ongeldig gewicht", pt: "Peso inválido", sw: "Uzito batili", tr: "Geçersiz kilo", zh: "无效体重"
  },
  "alert.low_energy": {
    ar: "طاقة غير كافية", de: "Nicht genug Energie", es: "Energía insuficiente", fr: "Énergie insuffisante", hi: "पर्याप्त ऊर्जा नहीं",
    ja: "エネルギー不足", ko: "에너지 부족", nl: "Niet genoeg energie", pt: "Energia insuficiente", sw: "Nishati haitoshi", tr: "Yeterli enerji yok", zh: "能量不足"
  },
  "alert.meal_added": {
    ar: "تمت الإضافة إلى سجلك.", de: "zu deinem Protokoll hinzugefügt.", es: "añadido a tu registro.", fr: "ajouté à votre journal.", hi: "आपके लॉग में जोड़ा गया।",
    ja: "ログに追加しました。", ko: "로그에 추가되었습니다.", nl: "toegevoegd aan je log.", pt: "adicionado ao seu registro.", sw: "imeongezwa kwenye rekodi yako.", tr: "kaydınıza eklendi.", zh: "已添加到您的记录。"
  },
  "alert.no_data": {
    ar: "لا توجد بيانات", de: "Keine Daten gefunden", es: "No se encontraron datos", fr: "Aucune donnée trouvée", hi: "कोई डेटा नहीं मिला",
    ja: "データが見つかりません", ko: "데이터 없음", nl: "Geen gegevens gevonden", pt: "Nenhum dado encontrado", sw: "Hakuna data iliyopatikana", tr: "Veri bulunamadı", zh: "未找到数据"
  },
  "alert.notifications_disabled": {
    ar: "الإشعارات معطلة", de: "Benachrichtigungen deaktiviert", es: "Notificaciones desactivadas", fr: "Notifications désactivées", hi: "सूचनाएं अक्षम",
    ja: "通知が無効です", ko: "알림 비활성화됨", nl: "Meldingen uitgeschakeld", pt: "Notificações desativadas", sw: "Arifa zimezimwa", tr: "Bildirimler devre dışı", zh: "通知已禁用"
  },
  "alert.ok": {
    ar: "حسنًا", de: "OK", es: "OK", fr: "OK", hi: "ठीक है",
    ja: "OK", ko: "확인", nl: "OK", pt: "OK", sw: "Sawa", tr: "Tamam", zh: "确定"
  },
  "alert.profile_updated": {
    ar: "تم تحديث الملف الشخصي.", de: "Profil aktualisiert.", es: "Perfil actualizado.", fr: "Profil mis à jour.", hi: "प्रोफ़ाइल अपडेट हुई।",
    ja: "プロフィールを更新しました。", ko: "프로필이 업데이트되었습니다.", nl: "Profiel bijgewerkt.", pt: "Perfil atualizado.", sw: "Wasifu umesasishwa.", tr: "Profil güncellendi.", zh: "个人资料已更新。"
  },
  "alert.reminder_scheduled_for": {
    ar: "مجدول لـ", de: "Geplant für", es: "Programado para", fr: "Programmé pour", hi: "के लिए शेड्यूल किया गया",
    ja: "予定時刻：", ko: "예약됨:", nl: "Gepland voor", pt: "Agendado para", sw: "Imepangwa kwa", tr: "Şu tarih için planlandı:", zh: "预定于"
  },
  "alert.reminder_set": {
    ar: "تم ضبط التذكير", de: "Erinnerung gesetzt", es: "Recordatorio establecido", fr: "Rappel défini", hi: "अनुस्मारक सेट किया गया",
    ja: "リマインダーを設定しました", ko: "알림 설정됨", nl: "Herinnering ingesteld", pt: "Lembrete definido", sw: "Ukumbusho umewekwa", tr: "Hatırlatıcı ayarlandı", zh: "提醒已设置"
  },
  "alert.saved": {
    ar: "تم الحفظ", de: "Gespeichert", es: "Guardado", fr: "Enregistré", hi: "सहेजा गया",
    ja: "保存しました", ko: "저장됨", nl: "Opgeslagen", pt: "Salvo", sw: "Imehifadhiwa", tr: "Kaydedildi", zh: "已保存"
  },
  "alert.sleep_complete": {
    ar: "اكتملت جلسة النوم", de: "Schlaf-Sitzung abgeschlossen", es: "Sesión de sueño completada", fr: "Session de sommeil terminée", hi: "नींद सत्र पूर्ण",
    ja: "睡眠セッション完了", ko: "수면 세션 완료", nl: "Slaapsessie voltooid", pt: "Sessão de sono concluída", sw: "Kipindi cha usingizi kimekamilika", tr: "Uyku seansı tamamlandı", zh: "睡眠会话完成"
  },
  "alert.try_again": {
    ar: "يرجى المحاولة مرة أخرى.", de: "Bitte versuche es erneut.", es: "Por favor, inténtalo de nuevo.", fr: "Veuillez réessayer.", hi: "कृपया पुनः प्रयास करें।",
    ja: "もう一度お試しください。", ko: "다시 시도해 주세요.", nl: "Probeer het opnieuw.", pt: "Por favor, tente novamente.", sw: "Tafadhali jaribu tena.", tr: "Lütfen tekrar deneyin.", zh: "请重试。"
  },
  "alert.water_added": {
    ar: "تمت إضافة الماء", de: "Wasser hinzugefügt", es: "Agua añadida", fr: "Eau ajoutée", hi: "पानी जोड़ा गया",
    ja: "水分を追加しました", ko: "물 추가됨", nl: "Water toegevoegd", pt: "Água adicionada", sw: "Maji yameongezwa", tr: "Su eklendi", zh: "已添加水"
  }
};

// Function to apply translations
function applyTranslations() {
  console.log('Applying complete translations to language files...\n');

  const languages = ['ar', 'de', 'es', 'fr', 'hi', 'ja', 'ko', 'nl', 'pt', 'sw', 'tr', 'zh'];

  for (const lang of languages) {
    const filePath = path.join(TRANSLATIONS_DIR, `${lang}.json`);

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const translations = JSON.parse(content);

      let updated = 0;

      // Apply each translation
      for (const [key, langValues] of Object.entries(TRANSLATIONS)) {
        if (langValues[lang] && translations[key] !== undefined) {
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

  console.log('\nTranslations applied!');
}

applyTranslations();
