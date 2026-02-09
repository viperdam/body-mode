#!/usr/bin/env node
/**
 * Manual settings translations Part 1 - first 60 keys
 */

const fs = require('fs');
const path = require('path');

const TRANSLATIONS_DIR = path.join(__dirname, '../src/i18n/translations');

const TRANSLATIONS = {
  "settings.account.sign_in": {
    ar: "تسجيل الدخول",
    de: "Anmelden",
    es: "Iniciar sesión",
    fr: "Se connecter",
    hi: "साइन इन",
    ja: "サインイン",
    ko: "로그인",
    nl: "Aanmelden",
    pt: "Entrar",
    sw: "Ingia",
    tr: "Giriş Yap",
    zh: "登录"
  },
  "settings.account_guest": {
    ar: "حساب ضيف (غير مرتبط)",
    de: "Gastkonto (nicht verknüpft)",
    es: "Cuenta de invitado (no vinculada)",
    fr: "Compte invité (non lié)",
    hi: "अतिथि खाता (लिंक नहीं)",
    ja: "ゲストアカウント（未リンク）",
    ko: "게스트 계정 (연결되지 않음)",
    nl: "Gastaccount (niet gekoppeld)",
    pt: "Conta de convidado (não vinculada)",
    sw: "Akaunti ya Mgeni (haijaunganishwa)",
    tr: "Misafir hesabı (bağlı değil)",
    zh: "访客账户（未关联）"
  },
  "settings.account_linked": {
    ar: "مرتبط: %{providers}",
    de: "Verknüpft: %{providers}",
    es: "Vinculado: %{providers}",
    fr: "Lié : %{providers}",
    hi: "लिंक किया गया: %{providers}",
    ja: "リンク済み: %{providers}",
    ko: "연결됨: %{providers}",
    nl: "Gekoppeld: %{providers}",
    pt: "Vinculado: %{providers}",
    sw: "Imeunganishwa: %{providers}",
    tr: "Bağlı: %{providers}",
    zh: "已关联：%{providers}"
  },
  "settings.adaptive.empty_summary": {
    ar: "أكمل أو تخطَّ أو أجّل بعض التذكيرات لتخصيص خطتك.",
    de: "Erledige, überspringe oder verschiebe einige Erinnerungen um deinen Plan zu personalisieren.",
    es: "Completa, omite o pospón algunos recordatorios para personalizar tu plan.",
    fr: "Terminez, ignorez ou reportez quelques rappels pour personnaliser votre plan.",
    hi: "अपनी योजना को वैयक्तिकृत करने के लिए कुछ अनुस्मारक पूरे करें, छोड़ें या स्नूज़ करें।",
    ja: "プランをパーソナライズするためにいくつかのリマインダーを完了、スキップ、またはスヌーズしてください。",
    ko: "플랜을 개인화하려면 몇 가지 알림을 완료, 건너뛰기 또는 스누즈하세요.",
    nl: "Voltooi, sla over of sluimer enkele herinneringen om je plan te personaliseren.",
    pt: "Complete, pule ou adie alguns lembretes para personalizar seu plano.",
    sw: "Kamilisha, ruka, au ahirisha vikumbusho vichache ili kubinafishisha mpango wako.",
    tr: "Planınızı kişiselleştirmek için birkaç hatırlatıcıyı tamamlayın, atlayın veya erteleyin.",
    zh: "完成、跳过或推迟一些提醒以个性化您的计划。"
  },
  "settings.adaptive.preferred_hours": {
    ar: "الساعات المفضلة: %{hours}",
    de: "Bevorzugte Stunden: %{hours}",
    es: "Horas preferidas: %{hours}",
    fr: "Heures préférées : %{hours}",
    hi: "पसंदीदा घंटे: %{hours}",
    ja: "希望時間: %{hours}",
    ko: "선호 시간: %{hours}",
    nl: "Voorkeurs uren: %{hours}",
    pt: "Horas preferidas: %{hours}",
    sw: "Masaa yanayopendelewa: %{hours}",
    tr: "Tercih edilen saatler: %{hours}",
    zh: "首选时间：%{hours}"
  },
  "settings.adaptive.reset_button": {
    ar: "إعادة تعيين التعلم التكيفي",
    de: "Adaptives Lernen zurücksetzen",
    es: "Restablecer aprendizaje adaptativo",
    fr: "Réinitialiser l'apprentissage adaptatif",
    hi: "अनुकूली शिक्षण रीसेट करें",
    ja: "適応学習をリセット",
    ko: "적응형 학습 재설정",
    nl: "Adaptief leren resetten",
    pt: "Redefinir aprendizado adaptativo",
    sw: "Weka upya ujifunzaji unaobadilika",
    tr: "Uyarlanabilir öğrenmeyi sıfırla",
    zh: "重置自适应学习"
  },
  "settings.adaptive.section_subtitle": {
    ar: "التخصيص بناءً على إجراءاتك",
    de: "Personalisierung basierend auf deinen Aktionen",
    es: "Personalización basada en tus acciones",
    fr: "Personnalisation basée sur vos actions",
    hi: "आपके कार्यों पर आधारित वैयक्तिकरण",
    ja: "あなたの行動に基づくパーソナライゼーション",
    ko: "행동에 따른 개인화",
    nl: "Personalisatie op basis van je acties",
    pt: "Personalização baseada em suas ações",
    sw: "Ubinafsishaji kulingana na vitendo vyako",
    tr: "Eylemlerinize göre kişiselleştirme",
    zh: "基于您的操作进行个性化"
  },
  "settings.adaptive.section_title": {
    ar: "رؤى تكيفية",
    de: "Adaptive Erkenntnisse",
    es: "Información adaptativa",
    fr: "Informations adaptatives",
    hi: "अनुकूली अंतर्दृष्टि",
    ja: "アダプティブインサイト",
    ko: "적응형 인사이트",
    nl: "Adaptieve inzichten",
    pt: "Insights adaptativos",
    sw: "Maarifa Yanayobadilika",
    tr: "Uyarlanabilir İçgörüler",
    zh: "自适应洞察"
  },
  "settings.adaptive.suppressed_hours": {
    ar: "الساعات المكتومة: %{hours}",
    de: "Unterdrückte Stunden: %{hours}",
    es: "Horas suprimidas: %{hours}",
    fr: "Heures supprimées : %{hours}",
    hi: "दबाए गए घंटे: %{hours}",
    ja: "抑制された時間: %{hours}",
    ko: "억제된 시간: %{hours}",
    nl: "Onderdrukte uren: %{hours}",
    pt: "Horas suprimidas: %{hours}",
    sw: "Masaa yaliyozuiwa: %{hours}",
    tr: "Bastırılan saatler: %{hours}",
    zh: "被抑制的时间：%{hours}"
  },
  "settings.adaptive.suppressed_types": {
    ar: "الأنواع المكتومة: %{types}",
    de: "Unterdrückte Typen: %{types}",
    es: "Tipos suprimidos: %{types}",
    fr: "Types supprimés : %{types}",
    hi: "दबाए गए प्रकार: %{types}",
    ja: "抑制されたタイプ: %{types}",
    ko: "억제된 유형: %{types}",
    nl: "Onderdrukte types: %{types}",
    pt: "Tipos suprimidos: %{types}",
    sw: "Aina zilizozuiwa: %{types}",
    tr: "Bastırılan türler: %{types}",
    zh: "被抑制的类型：%{types}"
  },
  "settings.alert.adaptive_confirm_body": {
    ar: "سيؤدي هذا إلى مسح التخصيص بناءً على العناصر المكتملة أو المتخطاة أو المؤجلة.",
    de: "Dies löscht die Personalisierung basierend auf erledigten, übersprungenen oder zurückgestellten Elementen.",
    es: "Esto borrará la personalización basada en elementos completados, omitidos o pospuestos.",
    fr: "Cela effacera la personnalisation basée sur les éléments terminés, ignorés ou reportés.",
    hi: "यह पूर्ण, छोड़े गए या स्नूज़ किए गए आइटम पर आधारित वैयक्तिकरण को साफ़ कर देगा।",
    ja: "これにより、完了、スキップ、またはスヌーズしたアイテムに基づくパーソナライゼーションがクリアされます。",
    ko: "완료, 건너뛰기 또는 스누즈한 항목을 기반으로 한 개인화가 삭제됩니다.",
    nl: "Dit wist personalisatie op basis van voltooide, overgeslagen of gesluimerde items.",
    pt: "Isso limpará a personalização baseada em itens concluídos, pulados ou adiados.",
    sw: "Hii itafuta ubinafsishaji kulingana na vitu vilivyokamilishwa, kurukwa, au kuahirishwa.",
    tr: "Bu, tamamlanan, atlanan veya ertelenen öğelere dayalı kişiselleştirmeyi temizleyecektir.",
    zh: "这将清除基于已完成、跳过或推迟项目的个性化设置。"
  },
  "settings.alert.adaptive_confirm_title": {
    ar: "إعادة تعيين التعلم التكيفي؟",
    de: "Adaptives Lernen zurücksetzen?",
    es: "¿Restablecer aprendizaje adaptativo?",
    fr: "Réinitialiser l'apprentissage adaptatif ?",
    hi: "अनुकूली शिक्षण रीसेट करें?",
    ja: "適応学習をリセットしますか？",
    ko: "적응형 학습을 재설정하시겠습니까?",
    nl: "Adaptief leren resetten?",
    pt: "Redefinir aprendizado adaptativo?",
    sw: "Weka upya ujifunzaji unaobadilika?",
    tr: "Uyarlanabilir öğrenme sıfırlansın mı?",
    zh: "重置自适应学习？"
  },
  "settings.alert.adaptive_reset_body": {
    ar: "سيتم إعادة بناء التخصيص من إجراءاتك القادمة.",
    de: "Personalisierung wird aus deinen nächsten Aktionen neu aufgebaut.",
    es: "La personalización se reconstruirá a partir de tus próximas acciones.",
    fr: "La personnalisation sera reconstruite à partir de vos prochaines actions.",
    hi: "आपके अगले कार्यों से वैयक्तिकरण पुनर्निर्माण होगा।",
    ja: "パーソナライゼーションは次のアクションから再構築されます。",
    ko: "다음 행동에서 개인화가 재구축됩니다.",
    nl: "Personalisatie wordt opnieuw opgebouwd uit je volgende acties.",
    pt: "A personalização será reconstruída a partir de suas próximas ações.",
    sw: "Ubinafsishaji utajengwa upya kutoka kwa vitendo vyako vijavyo.",
    tr: "Kişiselleştirme bir sonraki eylemlerinizden yeniden oluşturulacaktır.",
    zh: "个性化将从您的下一步操作重新构建。"
  },
  "settings.alert.adaptive_reset_failed": {
    ar: "تعذر إعادة تعيين الرؤى التكيفية. يرجى المحاولة مرة أخرى.",
    de: "Adaptive Erkenntnisse konnten nicht zurückgesetzt werden. Bitte erneut versuchen.",
    es: "No se pudieron restablecer los insights adaptativos. Por favor, inténtalo de nuevo.",
    fr: "Impossible de réinitialiser les insights adaptatifs. Veuillez réessayer.",
    hi: "अनुकूली अंतर्दृष्टि रीसेट करने में असमर्थ। कृपया पुनः प्रयास करें।",
    ja: "アダプティブインサイトをリセットできません。もう一度お試しください。",
    ko: "적응형 인사이트를 재설정할 수 없습니다. 다시 시도해 주세요.",
    nl: "Kan adaptieve inzichten niet resetten. Probeer het opnieuw.",
    pt: "Não foi possível redefinir os insights adaptativos. Por favor, tente novamente.",
    sw: "Imeshindwa kuweka upya maarifa yanayobadilika. Tafadhali jaribu tena.",
    tr: "Uyarlanabilir içgörüler sıfırlanamadı. Lütfen tekrar deneyin.",
    zh: "无法重置自适应洞察。请重试。"
  },
  "settings.alert.adaptive_reset_title": {
    ar: "تم إعادة تعيين التعلم التكيفي",
    de: "Adaptives Lernen zurückgesetzt",
    es: "Aprendizaje adaptativo restablecido",
    fr: "Apprentissage adaptatif réinitialisé",
    hi: "अनुकूली शिक्षण रीसेट किया गया",
    ja: "適応学習をリセットしました",
    ko: "적응형 학습 재설정됨",
    nl: "Adaptief leren gereset",
    pt: "Aprendizado adaptativo redefinido",
    sw: "Ujifunzaji unaobadilika umewekwa upya",
    tr: "Uyarlanabilir öğrenme sıfırlandı",
    zh: "自适应学习已重置"
  },
  "settings.alert.battery_optimization_body": {
    ar: "للحصول على أفضل النتائج، قم بتعطيل تحسين البطارية حتى يعمل تتبع النوم بشكل موثوق.",
    de: "Für beste Ergebnisse deaktiviere die Batterieoptimierung, damit die Schlafverfolgung zuverlässig funktioniert.",
    es: "Para mejores resultados, desactiva la optimización de batería para que el seguimiento del sueño funcione de manera confiable.",
    fr: "Pour de meilleurs résultats, désactivez l'optimisation de la batterie pour que le suivi du sommeil fonctionne de manière fiable.",
    hi: "सर्वोत्तम परिणामों के लिए, बैटरी ऑप्टिमाइज़ेशन अक्षम करें ताकि स्लीप ट्रैकिंग विश्वसनीय रूप से काम करे।",
    ja: "最良の結果を得るには、バッテリー最適化を無効にして睡眠追跡が確実に機能するようにしてください。",
    ko: "최상의 결과를 위해 배터리 최적화를 비활성화하여 수면 추적이 안정적으로 작동하도록 하세요.",
    nl: "Voor de beste resultaten, schakel batterijoptimalisatie uit zodat slaaptracking betrouwbaar werkt.",
    pt: "Para melhores resultados, desative a otimização de bateria para que o rastreamento de sono funcione de forma confiável.",
    sw: "Kwa matokeo bora, zima uboreshaji wa betri ili ufuatiliaji wa usingizi ufanye kazi kwa uhakika.",
    tr: "En iyi sonuçlar için, uyku takibinin güvenilir şekilde çalışması için pil optimizasyonunu devre dışı bırakın.",
    zh: "为获得最佳效果，请禁用电池优化以确保睡眠追踪可靠运行。"
  },
  "settings.alert.battery_optimization_body_aggressive": {
    ar: "قد يقوم جهازك بإيقاف المهام الخلفية. للحصول على تتبع نوم موثوق، يرجى تعطيل تحسين البطارية لهذا التطبيق.",
    de: "Dein Gerät kann Hintergrundaufgaben beenden. Für zuverlässiges Schlaftracking deaktiviere bitte die Batterieoptimierung für diese App.",
    es: "Tu dispositivo puede cerrar tareas en segundo plano. Para un seguimiento del sueño confiable, desactiva la optimización de batería para esta aplicación.",
    fr: "Votre appareil peut arrêter les tâches en arrière-plan. Pour un suivi du sommeil fiable, veuillez désactiver l'optimisation de la batterie pour cette application.",
    hi: "आपका डिवाइस बैकग्राउंड टास्क को बंद कर सकता है। विश्वसनीय स्लीप ट्रैकिंग के लिए, कृपया इस ऐप के लिए बैटरी ऑप्टिमाइज़ेशन अक्षम करें।",
    ja: "デバイスがバックグラウンドタスクを終了する場合があります。信頼性の高い睡眠追跡のために、このアプリのバッテリー最適化を無効にしてください。",
    ko: "기기가 백그라운드 작업을 종료할 수 있습니다. 안정적인 수면 추적을 위해 이 앱의 배터리 최적화를 비활성화해 주세요.",
    nl: "Je apparaat kan achtergrondtaken beëindigen. Voor betrouwbare slaaptracking, schakel batterijoptimalisatie voor deze app uit.",
    pt: "Seu dispositivo pode encerrar tarefas em segundo plano. Para rastreamento de sono confiável, desative a otimização de bateria para este aplicativo.",
    sw: "Kifaa chako kinaweza kuua kazi za nyuma. Kwa ufuatiliaji wa usingizi wa kuaminika, tafadhali zima uboreshaji wa betri kwa programu hii.",
    tr: "Cihazınız arka plan görevlerini sonlandırabilir. Güvenilir uyku takibi için lütfen bu uygulama için pil optimizasyonunu devre dışı bırakın.",
    zh: "您的设备可能会终止后台任务。为确保睡眠追踪可靠运行，请为此应用禁用电池优化。"
  },
  "settings.alert.battery_optimization_title": {
    ar: "⚡ تحسين البطارية",
    de: "⚡ Batterieoptimierung",
    es: "⚡ Optimización de batería",
    fr: "⚡ Optimisation de la batterie",
    hi: "⚡ बैटरी ऑप्टिमाइज़ेशन",
    ja: "⚡ バッテリー最適化",
    ko: "⚡ 배터리 최적화",
    nl: "⚡ Batterijoptimalisatie",
    pt: "⚡ Otimização de bateria",
    sw: "⚡ Uboreshaji wa Betri",
    tr: "⚡ Pil Optimizasyonu",
    zh: "⚡ 电池优化"
  },
  "settings.alert.clear_data_body": {
    ar: "سيؤدي هذا إلى حذف جميع بياناتك بشكل دائم بما في ذلك الملف الشخصي وسجلات الطعام وتاريخ المزاج وتاريخ الوزن والخطط اليومية. لا يمكن التراجع عن هذا الإجراء.",
    de: "Dies löscht dauerhaft alle deine Daten einschließlich Profil, Essensprotokollen, Stimmungsverlauf, Gewichtsverlauf und Tagesplänen. Diese Aktion kann nicht rückgängig gemacht werden.",
    es: "Esto eliminará permanentemente todos tus datos, incluyendo perfil, registros de comida, historial de ánimo, historial de peso y planes diarios. Esta acción no se puede deshacer.",
    fr: "Cela supprimera définitivement toutes vos données, y compris le profil, les journaux alimentaires, l'historique d'humeur, l'historique de poids et les plans quotidiens. Cette action est irréversible.",
    hi: "यह आपके सभी डेटा को स्थायी रूप से हटा देगा जिसमें प्रोफ़ाइल, फूड लॉग, मूड हिस्ट्री, वेट हिस्ट्री और डेली प्लान शामिल हैं। यह क्रिया पूर्ववत नहीं की जा सकती।",
    ja: "これにより、プロフィール、食事記録、気分履歴、体重履歴、デイリープランを含むすべてのデータが完全に削除されます。この操作は元に戻せません。",
    ko: "프로필, 음식 기록, 기분 기록, 체중 기록, 일일 계획을 포함한 모든 데이터가 영구적으로 삭제됩니다. 이 작업은 취소할 수 없습니다.",
    nl: "Dit verwijdert permanent al je gegevens inclusief profiel, voedsellogboeken, stemmingsgeschiedenis, gewichtsgeschiedenis en dagplannen. Deze actie kan niet ongedaan worden gemaakt.",
    pt: "Isso excluirá permanentemente todos os seus dados, incluindo perfil, registros de alimentos, histórico de humor, histórico de peso e planos diários. Esta ação não pode ser desfeita.",
    sw: "Hii itafuta kabisa data yako yote ikiwa ni pamoja na wasifu, rekodi za chakula, historia ya hali, historia ya uzito, na mipango ya kila siku. Kitendo hiki hakiwezi kutenduliwa.",
    tr: "Bu, profil, yemek kayıtları, ruh hali geçmişi, kilo geçmişi ve günlük planlar dahil tüm verilerinizi kalıcı olarak silecektir. Bu işlem geri alınamaz.",
    zh: "这将永久删除您的所有数据，包括个人资料、饮食记录、心情历史、体重历史和每日计划。此操作无法撤销。"
  },
  "settings.alert.clear_data_title": {
    ar: "⚠️ مسح جميع البيانات",
    de: "⚠️ Alle Daten löschen",
    es: "⚠️ Borrar todos los datos",
    fr: "⚠️ Effacer toutes les données",
    hi: "⚠️ सभी डेटा साफ़ करें",
    ja: "⚠️ すべてのデータを削除",
    ko: "⚠️ 모든 데이터 삭제",
    nl: "⚠️ Alle gegevens wissen",
    pt: "⚠️ Limpar todos os dados",
    sw: "⚠️ Futa Data Zote",
    tr: "⚠️ Tüm Verileri Sil",
    zh: "⚠️ 清除所有数据"
  },
  "settings.alert.delete_everything": {
    ar: "حذف كل شيء",
    de: "Alles löschen",
    es: "Eliminar todo",
    fr: "Tout supprimer",
    hi: "सब कुछ हटाएं",
    ja: "すべて削除",
    ko: "모두 삭제",
    nl: "Alles verwijderen",
    pt: "Excluir tudo",
    sw: "Futa Kila Kitu",
    tr: "Her şeyi sil",
    zh: "删除全部"
  },
  "settings.alert.health_permission_body": {
    ar: "صلاحيات الصحة مطلوبة لمزامنة البيانات.",
    de: "Gesundheitsberechtigungen sind erforderlich um Daten zu synchronisieren.",
    es: "Se requieren permisos de salud para sincronizar datos.",
    fr: "Les autorisations de santé sont requises pour synchroniser les données.",
    hi: "डेटा सिंक करने के लिए स्वास्थ्य अनुमतियाँ आवश्यक हैं।",
    ja: "データを同期するには健康の許可が必要です。",
    ko: "데이터를 동기화하려면 건강 권한이 필요합니다.",
    nl: "Gezondheidsrechten zijn vereist om gegevens te synchroniseren.",
    pt: "Permissões de saúde são necessárias para sincronizar dados.",
    sw: "Ruhusa za afya zinahitajika kusawazisha data.",
    tr: "Verileri senkronize etmek için sağlık izinleri gereklidir.",
    zh: "同步数据需要健康权限。"
  },
  "settings.alert.health_permission_title": {
    ar: "تم رفض الصلاحية",
    de: "Berechtigung verweigert",
    es: "Permiso denegado",
    fr: "Autorisation refusée",
    hi: "अनुमति अस्वीकृत",
    ja: "許可が拒否されました",
    ko: "권한 거부됨",
    nl: "Toestemming geweigerd",
    pt: "Permissão negada",
    sw: "Ruhusa imekataliwa",
    tr: "İzin reddedildi",
    zh: "权限被拒绝"
  },
  "settings.alert.health_sync_error_body": {
    ar: "تعذر تحديث مزامنة الصحة الآن.",
    de: "Gesundheitssynchronisierung kann jetzt nicht aktualisiert werden.",
    es: "No se puede actualizar la sincronización de salud ahora.",
    fr: "Impossible de mettre à jour la synchronisation santé maintenant.",
    hi: "अभी स्वास्थ्य सिंक अपडेट करने में असमर्थ।",
    ja: "健康同期を今すぐ更新できません。",
    ko: "지금 건강 동기화를 업데이트할 수 없습니다.",
    nl: "Kan gezondheidssynchronisatie nu niet bijwerken.",
    pt: "Não foi possível atualizar a sincronização de saúde agora.",
    sw: "Imeshindwa kusasisha usawazishaji wa afya sasa.",
    tr: "Sağlık senkronizasyonu şu anda güncellenemiyor.",
    zh: "目前无法更新健康同步。"
  },
  "settings.alert.health_sync_error_title": {
    ar: "خطأ في مزامنة الصحة",
    de: "Gesundheitssynchronisierungsfehler",
    es: "Error de sincronización de salud",
    fr: "Erreur de synchronisation santé",
    hi: "स्वास्थ्य सिंक त्रुटि",
    ja: "健康同期エラー",
    ko: "건강 동기화 오류",
    nl: "Gezondheidssynchronisatiefout",
    pt: "Erro de sincronização de saúde",
    sw: "Hitilafu ya usawazishaji wa afya",
    tr: "Sağlık senkronizasyon hatası",
    zh: "健康同步错误"
  },
  "settings.alert.health_unavailable_body": {
    ar: "التكامل الصحي غير مدعوم على هذا الجهاز.",
    de: "Gesundheitsintegration wird auf diesem Gerät nicht unterstützt.",
    es: "La integración de salud no es compatible con este dispositivo.",
    fr: "L'intégration santé n'est pas prise en charge sur cet appareil.",
    hi: "इस डिवाइस पर स्वास्थ्य एकीकरण समर्थित नहीं है।",
    ja: "このデバイスでは健康統合はサポートされていません。",
    ko: "이 기기에서는 건강 통합이 지원되지 않습니다.",
    nl: "Gezondheidsintegratie wordt niet ondersteund op dit apparaat.",
    pt: "A integração de saúde não é suportada neste dispositivo.",
    sw: "Ushirikiano wa afya hauungwi mkono kwenye kifaa hiki.",
    tr: "Sağlık entegrasyonu bu cihazda desteklenmiyor.",
    zh: "此设备不支持健康集成。"
  },
  "settings.alert.health_unavailable_title": {
    ar: "الصحة غير متوفرة",
    de: "Gesundheit nicht verfügbar",
    es: "Salud no disponible",
    fr: "Santé non disponible",
    hi: "स्वास्थ्य उपलब्ध नहीं",
    ja: "健康機能は利用できません",
    ko: "건강 사용 불가",
    nl: "Gezondheid niet beschikbaar",
    pt: "Saúde não disponível",
    sw: "Afya haipatikani",
    tr: "Sağlık kullanılamıyor",
    zh: "健康不可用"
  },
  "settings.alert.logout_action": {
    ar: "تسجيل الخروج",
    de: "Abmelden",
    es: "Cerrar sesión",
    fr: "Se déconnecter",
    hi: "लॉग आउट",
    ja: "ログアウト",
    ko: "로그아웃",
    nl: "Uitloggen",
    pt: "Sair",
    sw: "Ondoka",
    tr: "Çıkış Yap",
    zh: "退出登录"
  },
  "settings.alert.logout_body": {
    ar: "هل تريد المتابعة بتسجيل الخروج؟ سيتم الاحتفاظ ببياناتك.",
    de: "Möchtest du dich wirklich abmelden? Deine Daten werden behalten.",
    es: "¿Continuar cerrando sesión? Tus datos se conservarán.",
    fr: "Continuer à se déconnecter ? Vos données seront conservées.",
    hi: "लॉग आउट जारी रखें? आपका डेटा रखा जाएगा।",
    ja: "ログアウトを続けますか？データは保持されます。",
    ko: "로그아웃을 계속하시겠습니까? 데이터는 유지됩니다.",
    nl: "Doorgaan met uitloggen? Je gegevens worden bewaard.",
    pt: "Continuar saindo? Seus dados serão mantidos.",
    sw: "Endelea kuondoka? Data yako itahifadhiwa.",
    tr: "Çıkış yapmaya devam edilsin mi? Verileriniz saklanacaktır.",
    zh: "继续退出登录？您的数据将被保留。"
  },
  "settings.alert.logout_title": {
    ar: "تسجيل الخروج",
    de: "Abmelden",
    es: "Cerrar sesión",
    fr: "Se déconnecter",
    hi: "लॉग आउट",
    ja: "ログアウト",
    ko: "로그아웃",
    nl: "Uitloggen",
    pt: "Sair",
    sw: "Ondoka",
    tr: "Çıkış Yap",
    zh: "退出登录"
  },
  "settings.alert.open_link_body": {
    ar: "يرجى المحاولة مرة أخرى لاحقاً.",
    de: "Bitte später erneut versuchen.",
    es: "Por favor, inténtalo de nuevo más tarde.",
    fr: "Veuillez réessayer plus tard.",
    hi: "कृपया बाद में पुनः प्रयास करें।",
    ja: "後でもう一度お試しください。",
    ko: "나중에 다시 시도해 주세요.",
    nl: "Probeer het later opnieuw.",
    pt: "Por favor, tente novamente mais tarde.",
    sw: "Tafadhali jaribu tena baadaye.",
    tr: "Lütfen daha sonra tekrar deneyin.",
    zh: "请稍后重试。"
  },
  "settings.alert.open_link_title": {
    ar: "تعذر فتح الرابط",
    de: "Link kann nicht geöffnet werden",
    es: "No se puede abrir el enlace",
    fr: "Impossible d'ouvrir le lien",
    hi: "लिंक खोलने में असमर्थ",
    ja: "リンクを開けません",
    ko: "링크를 열 수 없음",
    nl: "Kan link niet openen",
    pt: "Não foi possível abrir o link",
    sw: "Imeshindwa kufungua kiungo",
    tr: "Bağlantı açılamıyor",
    zh: "无法打开链接"
  },
  "settings.alert.open_settings": {
    ar: "فتح الإعدادات",
    de: "Einstellungen öffnen",
    es: "Abrir configuración",
    fr: "Ouvrir les paramètres",
    hi: "सेटिंग्स खोलें",
    ja: "設定を開く",
    ko: "설정 열기",
    nl: "Instellingen openen",
    pt: "Abrir configurações",
    sw: "Fungua Mipangilio",
    tr: "Ayarları Aç",
    zh: "打开设置"
  },
  "settings.alert.overlay_permission_body": {
    ar: "لعرض التذكيرات فوق التطبيقات الأخرى، تحتاج إلى منح صلاحية \"العرض فوق التطبيقات الأخرى\".",
    de: "Um Erinnerungen über anderen Apps anzuzeigen, musst du die Berechtigung \"Über anderen Apps anzeigen\" erteilen.",
    es: "Para mostrar recordatorios sobre otras aplicaciones, necesitas otorgar el permiso \"Mostrar sobre otras aplicaciones\".",
    fr: "Pour afficher les rappels au-dessus d'autres applications, vous devez accorder l'autorisation \"Afficher par-dessus d'autres applications\".",
    hi: "अन्य ऐप्स पर रिमाइंडर दिखाने के लिए, आपको \"अन्य ऐप्स के ऊपर प्रदर्शित करें\" अनुमति देनी होगी।",
    ja: "他のアプリの上にリマインダーを表示するには、「他のアプリの上に表示」の許可を与える必要があります。",
    ko: "다른 앱 위에 알림을 표시하려면 \"다른 앱 위에 표시\" 권한을 부여해야 합니다.",
    nl: "Om herinneringen boven andere apps te tonen, moet je de toestemming \"Boven andere apps weergeven\" verlenen.",
    pt: "Para mostrar lembretes sobre outros aplicativos, você precisa conceder a permissão \"Exibir sobre outros aplicativos\".",
    sw: "Kuonyesha vikumbusho juu ya programu nyingine, unahitaji kutoa ruhusa ya \"Onyesha juu ya programu nyingine\".",
    tr: "Hatırlatıcıları diğer uygulamaların üzerinde göstermek için \"Diğer uygulamaların üzerinde görüntüle\" iznini vermeniz gerekir.",
    zh: "要在其他应用上方显示提醒，您需要授予「在其他应用上方显示」权限。"
  },
  "settings.alert.overlay_permission_title": {
    ar: "الصلاحية مطلوبة",
    de: "Berechtigung erforderlich",
    es: "Permiso requerido",
    fr: "Autorisation requise",
    hi: "अनुमति आवश्यक",
    ja: "許可が必要です",
    ko: "권한 필요",
    nl: "Toestemming vereist",
    pt: "Permissão necessária",
    sw: "Ruhusa Inahitajika",
    tr: "İzin Gerekli",
    zh: "需要权限"
  },
  "settings.alert.reset_onboarding_body": {
    ar: "سيؤدي هذا إلى مسح ملفك الشخصي وإعادة تشغيل عملية الإعداد.",
    de: "Dies löscht dein Profil und startet den Einrichtungsprozess neu.",
    es: "Esto borrará tu perfil y reiniciará el proceso de configuración.",
    fr: "Cela effacera votre profil et redémarrera le processus de configuration.",
    hi: "यह आपकी प्रोफ़ाइल साफ़ कर देगा और सेटअप प्रक्रिया को फिर से शुरू करेगा।",
    ja: "これによりプロフィールが消去され、セットアッププロセスが再開されます。",
    ko: "프로필이 지워지고 설정 프로세스가 다시 시작됩니다.",
    nl: "Dit wist je profiel en herstart het installatieproces.",
    pt: "Isso limpará seu perfil e reiniciará o processo de configuração.",
    sw: "Hii itafuta wasifu wako na kuanzisha upya mchakato wa usanidi.",
    tr: "Bu, profilinizi temizleyecek ve kurulum sürecini yeniden başlatacaktır.",
    zh: "这将清除您的个人资料并重新启动设置流程。"
  },
  "settings.alert.reset_onboarding_title": {
    ar: "إعادة تعيين الإعداد",
    de: "Onboarding zurücksetzen",
    es: "Restablecer incorporación",
    fr: "Réinitialiser l'intégration",
    hi: "ऑनबोर्डिंग रीसेट करें",
    ja: "オンボーディングをリセット",
    ko: "온보딩 재설정",
    nl: "Onboarding resetten",
    pt: "Redefinir integração",
    sw: "Weka upya Uanzishaji",
    tr: "Kurulumu Sıfırla",
    zh: "重置引导"
  },
  "settings.alert.restore_failed_body": {
    ar: "تعذر استعادة المشتريات. يرجى المحاولة مرة أخرى.",
    de: "Käufe konnten nicht wiederhergestellt werden. Bitte erneut versuchen.",
    es: "No se pudieron restaurar las compras. Por favor, inténtalo de nuevo.",
    fr: "Impossible de restaurer les achats. Veuillez réessayer.",
    hi: "खरीदारी पुनर्स्थापित करने में असमर्थ। कृपया पुनः प्रयास करें।",
    ja: "購入を復元できません。もう一度お試しください。",
    ko: "구매를 복원할 수 없습니다. 다시 시도해 주세요.",
    nl: "Kan aankopen niet herstellen. Probeer het opnieuw.",
    pt: "Não foi possível restaurar as compras. Por favor, tente novamente.",
    sw: "Imeshindwa kurejesha ununuzi. Tafadhali jaribu tena.",
    tr: "Satın almalar geri yüklenemedi. Lütfen tekrar deneyin.",
    zh: "无法恢复购买。请重试。"
  },
  "settings.alert.restore_failed_title": {
    ar: "فشلت الاستعادة",
    de: "Wiederherstellung fehlgeschlagen",
    es: "Restauración fallida",
    fr: "Échec de la restauration",
    hi: "पुनर्स्थापना विफल",
    ja: "復元に失敗しました",
    ko: "복원 실패",
    nl: "Herstel mislukt",
    pt: "Falha na restauração",
    sw: "Urejeshaji umeshindikana",
    tr: "Geri yükleme başarısız",
    zh: "恢复失败"
  },
  "settings.alert.test_crash_action": {
    ar: "تعطل الآن",
    de: "Jetzt abstürzen",
    es: "Bloquear ahora",
    fr: "Planter maintenant",
    hi: "अभी क्रैश करें",
    ja: "今すぐクラッシュ",
    ko: "지금 충돌",
    nl: "Nu crashen",
    pt: "Travar agora",
    sw: "Anguka sasa",
    tr: "Şimdi çökert",
    zh: "立即崩溃"
  },
  "settings.alert.test_crash_body": {
    ar: "سيؤدي هذا إلى تعطل التطبيق فوراً للتحقق من Crashlytics.",
    de: "Dies lässt die App sofort abstürzen um Crashlytics zu überprüfen.",
    es: "Esto bloqueará la aplicación inmediatamente para verificar Crashlytics.",
    fr: "Cela fera planter l'application immédiatement pour vérifier Crashlytics.",
    hi: "यह Crashlytics सत्यापित करने के लिए ऐप को तुरंत क्रैश कर देगा।",
    ja: "これにより、Crashlyticsを確認するためにアプリがすぐにクラッシュします。",
    ko: "Crashlytics를 확인하기 위해 앱이 즉시 충돌합니다.",
    nl: "Dit laat de app direct crashen om Crashlytics te verifiëren.",
    pt: "Isso travará o aplicativo imediatamente para verificar o Crashlytics.",
    sw: "Hii itaangusha programu mara moja kuthibitisha Crashlytics.",
    tr: "Bu, Crashlytics'i doğrulamak için uygulamayı hemen çökertecektir.",
    zh: "这将立即使应用崩溃以验证 Crashlytics。"
  },
  "settings.alert.test_crash_title": {
    ar: "تشغيل اختبار تعطل Crashlytics؟",
    de: "Crashlytics-Testabsturz auslösen?",
    es: "¿Activar prueba de bloqueo de Crashlytics?",
    fr: "Déclencher le test de crash Crashlytics ?",
    hi: "Crashlytics टेस्ट क्रैश ट्रिगर करें?",
    ja: "Crashlyticsテストクラッシュをトリガーしますか？",
    ko: "Crashlytics 테스트 충돌을 실행하시겠습니까?",
    nl: "Crashlytics testcrash activeren?",
    pt: "Acionar teste de travamento do Crashlytics?",
    sw: "Anzisha jaribio la kuanguka la Crashlytics?",
    tr: "Crashlytics test çökmesi tetiklensin mi?",
    zh: "触发 Crashlytics 测试崩溃？"
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
    console.log(`[settings-1] ${lang}: ${updated} keys updated`);
  }

  console.log('[settings-1] Part 1 complete');
};

main();
