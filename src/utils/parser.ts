import { ASTNode, NodeType, TypstCommand, DocumentTemplate } from '../types';

export const commandRegistry: Record<string, TypstCommand> = {
  הדגשה: {
    hebrewName: 'הדגשה',
    englishName: 'Bold',
    description: 'טקסט מודגש (מבליט את המילים החשובות)',
    example: '#הדגשה[שלום עולם]',
    category: 'Style',
    typstTemplate: '#text(weight: "bold")[%content%]',
  },
  נטוי: {
    hebrewName: 'נטוי',
    englishName: 'Italic',
    description: 'טקסט נטוי (לשימוש בציטוטים או מונחים)',
    example: '#נטוי[טקסט נטוי]',
    category: 'Style',
    typstTemplate: '#text(style: "italic")[%content%]',
  },
  קו_תחתון: {
    hebrewName: 'קו_תחתון',
    englishName: 'Underline',
    description: 'קו מתחת לטקסט',
    example: '#קו_תחתון[קו תחתון]',
    category: 'Style',
    typstTemplate: '#underline[%content%]',
  },
  קו_חוצה: {
    hebrewName: 'קו_חוצה',
    englishName: 'Strikethrough',
    description: 'קו חוצה את הטקסט',
    example: '#קו_חוצה[טקסט מחוק]',
    category: 'Style',
    typstTemplate: '#strike[%content%]',
  },
  כותרת1: {
    hebrewName: 'כותרת1',
    englishName: 'Heading 1',
    description: 'כותרת ראשית של פרק',
    example: '#כותרת1[שער ראשון]',
    category: 'Structure',
    typstTemplate: '#heading(level: 1)[%content%]',
  },
  כותרת2: {
    hebrewName: 'כותרת2',
    englishName: 'Heading 2',
    description: 'כותרת משנית של תת-נושא',
    example: '#כותרת2[פרק א]',
    category: 'Structure',
    typstTemplate: '#heading(level: 2)[%content%]',
  },
  כותרת3: {
    hebrewName: 'כותרת3',
    englishName: 'Heading 3',
    description: 'כותרת שלישית מפורטת',
    example: '#כותרת3[סעיף קטן]',
    category: 'Structure',
    typstTemplate: '#heading(level: 3)[%content%]',
  },
  רשימה: {
    hebrewName: 'רשימה',
    englishName: 'Bullet List',
    description: 'רשימה לא ממוספרת (רשימת פריטים)',
    example: '#רשימה[\n  #פריט[פריט א]\n  #פריט[פריט ב]\n]',
    category: 'Structure',
    typstTemplate: '#list[%content%]',
  },
  רשימה_ממוספרת: {
    hebrewName: 'רשימה_ממוספרת',
    englishName: 'Numbered List',
    description: 'רשימה ממוספרת לפי סדר',
    example: '#רשימה_ממוספרת[\n  #פריט[ראשון]\n  #פריט[שני]\n]',
    category: 'Structure',
    typstTemplate: '#enum[%content%]',
  },
  פריט: {
    hebrewName: 'פריט',
    englishName: 'List Item',
    description: 'פריט בודד בתוך רשימה',
    example: '#פריט[פריט חדש]',
    category: 'Structure',
    typstTemplate: '- [%content%]',
  },
  הערה: {
    hebrewName: 'הערה',
    englishName: 'Footnote',
    description: 'הערת שוליים מקוננת המופיעה בתחתית העמוד',
    example: '#הערה[הסבר מורחב על המילה]',
    category: 'Footnote',
    typstTemplate: '#footnote[%content%]',
  },
  הערהשטוחה: {
    hebrewName: 'הערהשטוחה',
    englishName: 'Flat Footnote',
    description: 'הערת שוליים שטוחה הנערמת עם שאר ההערות',
    example: '#הערהשטוחה[הערה שטוחה בתוך הבלוק]',
    category: 'Footnote',
    typstTemplate: '#footnote(style: "flat")[%content%]',
  },
  טבלה: {
    hebrewName: 'טבלה',
    englishName: 'Table',
    description: 'טבלה מסודרת המכילה שורות ותאים',
    example: '#טבלה[\n  #שורה[#תא[עמודה א] #תא[עמודה ב]]\n  #שורה[#תא[ערך 1] #תא[ערך 2]]\n]',
    category: 'Table',
    typstTemplate: '#table(columns: 2)[%content%]',
  },
  שורה: {
    hebrewName: 'שורה',
    englishName: 'Table Row',
    description: 'שורה של תאים בטבלה',
    example: '#שורה[#תא[נתון 1] #תא[נתון 2]]',
    category: 'Table',
    typstTemplate: '%content%',
  },
  תא: {
    hebrewName: 'תא',
    englishName: 'Table Cell',
    description: 'תא בודד בתוך שורה',
    example: '#תא[תוכן התא]',
    category: 'Table',
    typstTemplate: '[%content%]',
  },
  מרכז: {
    hebrewName: 'מרכז',
    englishName: 'Align Center',
    description: 'יישור הטקסט למרכז העמוד',
    example: '#מרכז[טקסט ממורכז]',
    category: 'Layout',
    typstTemplate: '#align(center)[%content%]',
  },
  ימין: {
    hebrewName: 'ימין',
    englishName: 'Align Right',
    description: 'יישור הטקסט לימין (לכתיבה עברית תקנית)',
    example: '#ימין[טקסט מיושר לימין]',
    category: 'Layout',
    typstTemplate: '#align(right)[%content%]',
  },
  שמאל: {
    hebrewName: 'שמאל',
    englishName: 'Align Left',
    description: 'יישור הטקסט לשמאל (למספרים או שפות לועזיות)',
    example: '#שמאל[Left aligned text]',
    category: 'Layout',
    typstTemplate: '#align(left)[%content%]',
  },
  כתב_גדול: {
    hebrewName: 'כתב_גדול',
    englishName: 'Large Font',
    description: 'הגדלת גודל הגופן לטקסט מודגש או מוגדל',
    example: '#כתב_גדול[טקסט גדול]',
    category: 'Style',
    typstTemplate: '#text(size: 1.2em)[%content%]',
  },
  כתב_קטן: {
    hebrewName: 'כתב_קטן',
    englishName: 'Small Font',
    description: 'הקטנת גודל הגופן להערות או כותרות משנה קטנות',
    example: '#כתב_קטן[טקסט קטן]',
    category: 'Style',
    typstTemplate: '#text(size: 0.8em)[%content%]',
  },
};

export const documentTemplates: DocumentTemplate[] = [
  {
    id: 'letter',
    name: 'Letter',
    hebrewName: 'מכתב רשמי',
    description: 'A professional official letter format with clean spacing and aligned headers.',
    hebrewDescription: 'תבנית מכתב רשמי המיושר לימין עם שדות תאריך, נמען וחתימה.',
    content: `#ימין[
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
]`,
  },
  {
    id: 'article',
    name: 'Article',
    hebrewName: 'מאמר אקדמי',
    description: 'A structured article template with abstract, headings, and footnotes.',
    hebrewDescription: 'תבנית מאמר אקדמי או תורני המבוסס על כותרות, טקסט מיושר, והערות שוליים רבות.',
    content: `#מרכז[
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

נראה כי השילוב של צורה ותוכן מגיע לשיאו בעימוד העברי התורני, כפי שניתן לראות בדפוסים העתיקים ששילבו בצורה מופלאה בין גוף הטקסט לפרשנות שסביבו #הערהשטוחה[זהו הבסיס לעיצוב ה'ספר' וה'ספר התורני' המקובל כיום במערכת קסב].`,
  },
  {
    id: 'sefer',
    name: 'Sefer (Book)',
    hebrewName: 'ספר תורני / חיבור',
    description: 'Traditional Rabbinic sefer format with custom header, footnotes, and layout.',
    hebrewDescription: 'עיצוב ספר מסורתי או חיבור הלכתי רחב, הכולל פרקים מפורטים, כותרות והערות שוליים כפולות.',
    content: `#מרכז[
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

ומזה נלמד לעניין עימוד ממוחשב, שעלינו ליישר את השורות משני הצדדים ביישור מלא (Justify) על מנת לשמור על יפי הכתב וסדרו האסתטי, כראוי לחיבורים תורניים וספרי קודש.`,
  },
  {
    id: 'bentcher',
    name: 'Bentcher',
    hebrewName: 'ברכת המזון',
    description: 'Elegant invitation-sized bentcher template with classic borders.',
    hebrewDescription: 'סדר ברכת המזון בפורמט כרטיס מעוצב עם כותרות מסורתיות וסוגריים מרובעים להנחיות.',
    content: `#מרכז[
#כתב_גדול[#הדגשה[סדר ברכת המזון]]
#כתב_קטן[נוסח ספרד | מותאם לספרונים וברכונים]

#כותרת2[זימון]
המוביל אומר: #הדגשה[רַבּוֹתַי נְבָרֵךְ.]
המסובים עונים: #הדגשה[יְהִי שֵׁם ה' מְבֹרָךְ מֵעַתָּה וְעַד עוֹלָם.]

#כותרת1[ברכה ראשונה - ברכת הזן]

בָּרוּךְ אַתָּה ה' אֱלֹהֵינוּ מֶלֶךְ הָעוֹלָם, הַזָּן אֶת הָעוֹלָם כֻּלּוֹ בְּחֵן בְּחֶסֶד וּבְרַחֲמִים. הוּא נוֹתֵן לֶחֶם לְכָל בָּשָׂר כִּי לְעוֹלָם חַסְדּוֹ. וּבְטוּבוֹ הַגָּדוֹל תָּמיד לֹא חָסַר לָנוּ וְאַל יֶחְסַר לָנוּ מָזוֹן לְעוֹלָם וָעֶד, בַּעֲבוּר שְׁמוֹ הַגָּדוֹל כִּי הוּא אֵל זָן וּמְפַרְנֵס לַכֹּל וּמֵטִיב לַכֹּל וּמֵכִין מָזוֹן לְכָל בְּרִיּוֹתָיו אֲשֶׁר בָּרָא. בָּרוּךְ אַתָּה ה', הַזָּן אֶת הַכֹּל.

#כותרת1[ברכה שנייה - ברכת הארץ]

נוֹדֶה לְּךָ ה' אֱלֹהֵינוּ עַל שֶׁהִנְחַלְתָּ לַאֲבוֹתֵינוּ אֶרֶץ חֶמְדָּה טוֹבָה וּרְחָבָה, וְעַל שֶׁהוֹצֵאתָנוּ ה' אֱלֹהֵינוּ מֵאֶרֶץ מִצְרַיִם וּפְדִיתָנוּ מִבֵּית עֲבָדִים, וְעַל בְּרִיתְךָ שֶׁחָתַמְתָּ בִּבְשָׂרֵנוּ, וְעַל תּוֹרָתְךָ שֶׁלִּמַּדְתָּנוּ וְעַל חֻקֶּיךָ שֶׁהוֹדַעְתָּנוּ #הערה[בספרים מסוימים מוסיפים כאן ברכת הודאה מיוחדת על חגי המועד ועל ניסים ונפלאות שנעשו בימים ההם ובזמן הזה], וְעַל חַיִּים חֵן וָחֶסֶד שֶׁחוֹנַנְתָּנוּ. וְעַל אֲכִילַת מָזוֹן שֶׁאַתָּה זָן וּמְפַרְנֵס אוֹתָנוּ תָּמִיד, בְּכָל יוֹם וּבְכָל עֵת וּבְכָל שָׁעָה.
]`,
  },
];

export function parseKsavMarkup(src: string): ASTNode[] {
  const nodes: ASTNode[] = [];
  let i = 0;

  while (i < src.length) {
    if (src[i] === '#' && i + 1 < src.length && src[i + 1] !== ' ') {
      const nameStart = i + 1;
      let nameEnd = nameStart;
      
      // Permit Hebrew letters (\u0590-\u05FF), english letters, numbers, and underscores
      while (nameEnd < src.length && /[\w\u0590-\u05FF_]/.test(src[nameEnd])) {
        nameEnd++;
      }
      
      const cmdName = src.substring(nameStart, nameEnd);
      
      if (cmdName && nameEnd < src.length && src[nameEnd] === '[') {
        const bracketStart = nameEnd;
        let depth = 1;
        let j = nameEnd + 1;
        
        while (j < src.length && depth > 0) {
          if (src[j] === '[') depth++;
          else if (src[j] === ']') depth--;
          j++;
        }
        
        const content = src.substring(bracketStart + 1, j - 1);
        const children = parseKsavMarkup(content);
        
        nodes.push({
          type: getNodeType(cmdName),
          value: cmdName,
          children,
          sourceStart: i,
          sourceEnd: j,
        });
        i = j;
      } else {
        nodes.push({
          type: 'text',
          text: `#${cmdName}`,
          sourceStart: i,
          sourceEnd: nameEnd,
        });
        i = nameEnd;
      }
    } else {
      let nextHash = src.indexOf('#', i);
      if (nextHash === -1) nextHash = src.length;
      const plain = src.substring(i, nextHash);
      if (plain.length > 0) {
        nodes.push({
          type: 'text',
          text: plain,
          sourceStart: i,
          sourceEnd: nextHash,
        });
      }
      i = nextHash;
    }
  }
  return nodes;
}

function getNodeType(name: string): NodeType {
  switch (name) {
    case 'הדגשה': return 'bold';
    case 'נטוי': return 'italic';
    case 'קו_תחתון': return 'underline';
    case 'קו_חוצה': return 'strikethrough';
    case 'כותרת1':
    case 'כותרת2':
    case 'כותרת3':
      return 'heading';
    case 'רשימה': return 'unorderedList';
    case 'רשימה_ממוספרת': return 'orderedList';
    case 'פריט': return 'listItem';
    case 'הערה': return 'footnote';
    case 'הערהשטוחה': return 'footnoteFlat';
    case 'טבלה': return 'table';
    case 'שורה': return 'tableRow';
    case 'תא': return 'tableCell';
    case 'מרכז': return 'alignCenter';
    case 'ימין': return 'alignRight';
    case 'שמאל': return 'alignLeft';
    case 'כתב_גדול': return 'largeText';
    case 'כתב_קטן': return 'smallText';
    default: return 'unknown';
  }
}

export function translateASTToTypst(nodes: ASTNode[]): string {
  return nodes
    .map((node) => {
      if (node.type === 'text') {
        return node.text || '';
      }
      const childrenTypst = translateASTToTypst(node.children || []);
      const cmd = commandRegistry[node.value || ''];
      if (cmd) {
        return cmd.typstTemplate.replace('%content%', childrenTypst);
      }
      return `#${node.value}[${childrenTypst}]`;
    })
    .join('');
}
