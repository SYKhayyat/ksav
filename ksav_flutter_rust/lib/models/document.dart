import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

class KsavDocument {
  final String id;
  String title;
  String content;
  DateTime lastModified;

  KsavDocument({
    required this.id,
    required this.title,
    required this.content,
    required this.lastModified,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'content': content,
        'lastModified': lastModified.toIso8601String(),
      };

  factory KsavDocument.fromJson(Map<String, dynamic> json) => KsavDocument(
        id: json['id'],
        title: json['title'],
        content: json['content'],
        lastModified: DateTime.parse(json['lastModified']),
      );
}

class DocumentTemplate {
  final String id;
  final String title;
  final String description;
  final String content;

  DocumentTemplate({
    required this.id,
    required this.title,
    required this.description,
    required this.content,
  });
}

final List<DocumentTemplate> documentTemplates = [
  DocumentTemplate(
    id: 'letter',
    title: 'מכתב רשמי',
    description: 'תבנית מכתב רשמי המיושר לימין עם שדות תאריך, נמען וחתימה.',
    content: """#ימין[
#כתב_גדול[#הדגשה[הנדון: פנייה רשמית בנושא שיפור השירות]]

בס"ד, י"ב בתמוז ה'תשפ"ו
לכבוד: מר משה כהן
מנהל מערכות מידע, חברת קסב בע"מ

שלום רב,

אני פונה אליך על מנת להציג את פרויקט #הדגשה[קסב (Ksav)] - מערכת כתיבה וסגנון עברית מתקדמת, המאפשרת כתיבה ישירה של פקודות עימוד בעימוד עברי מלא, ללא צורך בידע מוקדם באנגלית.

המערכת נותנת מענה מלא לצרכים הבאים:
#רשימה[
  #פריט[כתיבה נקייה באמצעות #הדגשה[מצב פרוזה] המסתיר את הפקודות.]
  #פריט[הערות שוליים מורכבות #הערה[תמיכה מלאה בהערות מקוננות או שטוחות לפי בחירת המשתמש].]
  #פריט[טבלאות ורשימות עשירות ללא הגבלה.]
]

נשמח מאוד לקבוע פגישת הדגמה קצרה על מנת לבחון שיתוף פעולה פורה.

בברכה רבה,
#הדגשה[צוות פיתוח מערכת קסב]
]""",
  ),
  DocumentTemplate(
    id: 'article',
    title: 'מאמר אקדמי',
    description: 'תבנית מאמר אקדמי או תורני המבוסס על כותרות, טקסט מיושר, והערות שוליים רבות.',
    content: """#מרכז[
#כתב_גדול[#הדגשה[מבוא לתולדות הכתב העברי וספרות האותיות]]
#כתב_קטן[מאת: אהרון לוי | אוניברסיטת קסב לעימוד ובלשנות]
]

#כותרת1[מבוא ושאלת המחקר]

הכתב העברי עבר תמורות רבות במהלך הדורות, החל מכתב דעץ הקדום ועד לכתב האשורי המצוי בימינו #הערה[ראה מסכת סנהדרין דף כ"א ע"ב, שם מובאת מחלוקת תנאים רחבה בעניין השתלשלות הכתב, האם ניתן התורה בכתב ליבונאה או בכתב אשורי, וכן הדעות לגבי שינוי הכתב בימי עזרא הסופר]. במאמר זה נבחן את המשמעויות הפילוסופיות והאסתטיות של מבנה האותיות העבריות, כפי שהן משתקפות בספרות הסוד ובספרות המסורה.

#כותרת2[השתלשלות האותיות והתפתחות העיצוב]

עיצובן של האותיות איננו רק עניין טכני, אלא משקף תפיסה תרבותית עמוקה של שילוב של קווים ונקודות. לדוגמה, האות א' מורכבת משני יו"דין וקו אלכסוני (ו"ו), המרמזים על אחדות הבורא בספרות הקבלה. 

להלן ריכוז של שלוש האותיות הראשונות ומשמעותן בקבלה:
#טבלה[
  #שורה[#תא[#הדגשה[אות]] #תא[#הדגשה[מבנה האות]] #תא[#הדגשה[משמעות פנימית]]]
  #שורה[#תא[א] #תא[שני יו"דין וו"ו] #תא[אחדות וחיבור בין שמים וארץ]]
  #שורה[#תא[ב] #תא[שלושה קווים סגורים] #תא[הבית והבריאה של העולם]]
  #שורה[#תא[ג] #תא[קווים ורגל פשוטה] #תא[גומל חסדים וריצה אל הדל]]
]

#כותרת2[סיכום ומסקנות]

נראה כי השילוב של צורה ותוכן מגיע לשיאו בעימוד העברי התורני, כפי שניתן לראות בדפוסים העתיקים ששילבו בצורה מופלאה בין גוף הטקסט לפרשנות שסביבו #הערהשטוחה[זהו הבסיס לעיצוב ה'ספר' וה'ספר התורני' המקובל כיום במערכת קסב].""",
  ),
  DocumentTemplate(
    id: 'sefer',
    title: 'ספר תורני / חיבור',
    description: 'עיצוב ספר מסורתי או חיבור הלכתי רחב, הכולל פרקים מפורטים, כותרות והערות שוליים כפולות.',
    content: """#מרכז[
#כתב_גדול[#הדגשה[ספר שערי הלכה]]
#כתב_קטן[בירורים וחקירות בענייני כתיבה ועימוד הלכתי]
]

#כותרת1[סימן א' - דיני שרטוט ואותיות מרובעות]

#הדגשה[א.] כתיבת ספר תורה, תפילין ומזוזות צריכה להיות על גבי קלף מעובד כהלכתו, ויש אומרים שדין שרטוט הוא הלכה למשה מסיני #הערה[רמב"ם פרק א' מהלכות תפילין הלכה י"ב, ובשולחן ערוך אורח חיים סימן ל"ב סעיף ו']. ואם כתב בלא שרטוט, הרי זה פסול בקלף של ספר תורה ושל מזוזה, אך בתפילין מקילים חלק מהפוסקים בשרטוט פנימי.

#כותרת2[ענף א - כתיבת אותיות מרובעות על פי המסורה]

בעניין כתיבת האותיות המרובעות (כתב אשורי), יש להקפיד שכל אות תהיה מוקפת באוויר מכל ארבע רוחותיה, שלא תיגע אות בחברתה ואפילו בקו דק כחוט השערה #הערה[ט"ז שם ס"ק ח', ועיין במשנה ברורה שתמה אם נגיעה מועטת פוסלת מיד או שמא מועיל בה תיקון, וביאר דתלוי אם האות איבדה את צורתה מחמת הנגיעה]. 

להלן הטבלה המסכמת את שיעור המרחקים ההלכתיים:
#טבלה[
  #שורה[#תא[#הדגשה[סוג האות]] #תא[#הדגשה[שיעור המרחק]] #תא[#הדגשה[השלכה לעימוד]]]
  #שורה[#תא[אותיות צמודות] #תא[מלוא חוט השערה] #תא[שימוש ברווח דק (Kerning)]]
  #שורה[#תא[בין תיבה לתיבה] #תא[מלוא אות קטנה] #תא[רווח מותאם (Space)]]
  #שורה[#תא[בין שורות] #תא[שיעור מלוא שורה] #תא[גובה שורה כפול (Leading)]]
]

ומזה נלמד לעניין עימוד ממוחשב, שעלינו ליישר את השורות משני הצדדים ביישור מלא (Justify) על מנת לשמור על יפי הכתב וסדרו האסתטי, כראוי לחיבורים תורניים וספרי קודש.""",
  ),
];

class DocumentStore {
  static const String _key = 'ksav_saved_documents';
  static const String _activeKey = 'ksav_active_doc_id';

  static Future<List<KsavDocument>> loadDocuments() async {
    final prefs = await SharedPreferences.getInstance();
    final data = prefs.getString(_key);
    if (data == null) {
      // Boot strap with default template
      final defaultDoc = KsavDocument(
        id: 'doc-letter',
        title: documentTemplates[0].title,
        content: documentTemplates[0].content,
        lastModified: DateTime.now(),
      );
      await saveDocuments([defaultDoc]);
      return [defaultDoc];
    }
    final List decoded = jsonDecode(data);
    return decoded.map((item) => KsavDocument.fromJson(item)).toList();
  }

  static Future<void> saveDocuments(List<KsavDocument> docs) async {
    final prefs = await SharedPreferences.getInstance();
    final encoded = jsonEncode(docs.map((doc) => doc.toJson()).toList());
    await prefs.setString(_key, encoded);
  }

  static Future<String?> getActiveDocId() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_activeKey);
  }

  static Future<void> setActiveDocId(String id) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_activeKey, id);
  }
}
