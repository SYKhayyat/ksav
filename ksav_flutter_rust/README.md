# קסב (Ksav) - מערכת עימוד וכתיבה עברית
### מבוסס פלאטר (Flutter) ומנוע עימוד מהיר בראסט (Rust Engine)

מערכת כתיבה ועימוד עברית מתקדמת בעלת ביצועים מעולים, הפועלת באופן מקומי לחלוטין (אופליין) ומתאימה למערכות הפעלה **Windows, macOS, Linux, Android ו-iOS**.

---

## 🏗️ מבנה פרויקט Flutter + Rust FFI

* `rust/src/parser.rs` - מפרסר (Parser) רקורסיבי מהיר במיוחד לניתוח תחביר פקודות קסב עבריות.
* `rust/src/html_renderer.rs` - מנוע סגנון מורכב המרכיב עמודי HTML מוכנים להדפסה (A4) כולל מערכת הערות שוליים היררכית ושטוחה וטבלאות מעוצבות.
* `rust/src/lib.rs` - ממשק קישור C-FFI המאפשר לפלאטר לשלוח מחרוזות טקסט ישירות לראסט ללא ביצוע העתקות זיכרון מיותרות (Zero-Copy).
* `lib/ffi/rust_ffi.dart` - מחלקת הקישור הדרטית הטוענת את הספרייה הדינמית בהתאם למערכת ההפעלה.
* `lib/widgets/prose_editor.dart` - תיבת טקסט המממשת את "מצב פרוזה" המיוחד המטשטש ומעלים את פקודות העימוד לחוויית כתיבה חלקה.

---

## 🚀 הוראות התקנה והרצה מקומית

כדי להריץ את האפליקציה במחשב שלך:

### 1. דרישות קדם (Prerequisites)
1. התקן את שפת **Rust**:
   [https://www.rust-lang.org/tools/install](https://www.rust-lang.org/tools/install)
2. התקן את פרימוורק **Flutter**:
   [https://docs.flutter.dev/get-started/install](https://docs.flutter.dev/get-started/install)

### 2. בניית מנוע ה-Rust לקישור (Compilation)
לפני הרצת פלאטר, עלינו לקמפל את קוד הראסט לספרייה דינמית מקומית:

```bash
cd rust
cargo build --release
```

לאחר הבנייה, הקובץ המקומפל יימצא בנתיב:
* **Windows**: `rust/target/release/ksav_engine.dll`
* **macOS**: `rust/target/release/libksav_engine.dylib`
* **Linux**: `rust/target/release/libksav_engine.so`

### 3. הרצת אפליקציית Flutter
העתק את קובץ הראסט המקומפל אל נתיב הרצת הפלאטר (או תן למערכת לקשר אותו אוטומטית), ואז הרץ את פקודת ההרצה:

```bash
flutter pub get
flutter run
```

---

## 📥 כיצד להוריד את קוד האפליקציה המלא כקובץ ZIP?

מאחר וכל הקוד נכתב בתוך תיקיית `/ksav_flutter_rust` של פרויקט ה-AI Studio הנוכחי, תוכל להוריד אותו ישירות למחשבך בצעד פשוט אחד:

1. לחץ על כפתור התפריט בצד שמאל למעלה (גלגל השיניים של **Settings** או תפריט הייצוא ב-AI Studio).
2. בחר באפשרות **Export as ZIP** או **Export to GitHub**.
3. חלץ את קובץ ה-ZIP במחשב ותיהנה מקוד מקור נקי ומלא לחלוטין ללא קיטועים!
