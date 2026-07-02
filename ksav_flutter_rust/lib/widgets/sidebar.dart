import 'package:flutter/material.dart';
import '../models/document.dart';
import '../models/style.dart';

class KsavSidebar extends StatelessWidget {
  final List<KsavDocument> documents;
  final String currentDocId;
  final Function(String id) onSelectDoc;
  final Function() onCreateDoc;
  final Function(String id) onDeleteDoc;
  
  // Configurations
  final String activeFont;
  final Function(String) onChangeFont;
  final int fontSize;
  final Function(int) onChangeFontSize;
  final int margin;
  final Function(int) onChangeMargin;
  final String footnoteStyle;
  final Function(String) onChangeFootnoteStyle;

  // Custom Styles
  final List<KsavCustomStyle> customStyles;
  final Function() onAddStyle;
  final Function(String name) onSelectStyle;

  KsavSidebar({
    required this.documents,
    required this.currentDocId,
    required this.onSelectDoc,
    required this.onCreateDoc,
    required this.onDeleteDoc,
    required this.activeFont,
    required this.onChangeFont,
    required this.fontSize,
    required this.onChangeFontSize,
    required this.margin,
    required this.onChangeMargin,
    required this.footnoteStyle,
    required this.onChangeFootnoteStyle,
    required this.customStyles,
    required this.onAddStyle,
    required this.onSelectStyle,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 280,
      decoration: BoxDecoration(
        color: Colors.grey[50],
        border: Border(
          left: BorderSide(color: Colors.grey[200]!, width: 1),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Sidebar Header
          Padding(
            padding: const EdgeInsets.all(16.0),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.between,
              children: [
                Row(
                  children: [
                    Icon(Icons.edit_document, color: Colors.blue[700]),
                    SizedBox(width: 8),
                    Text(
                      'קסב • מנהל מסמכים',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        fontFamily: 'Rubik',
                        color: Colors.grey[800],
                      ),
                    ),
                  ],
                ),
                IconButton(
                  icon: Icon(Icons.add, color: Colors.blue[700]),
                  onPressed: onCreateDoc,
                  tooltip: 'מסמך חדש',
                )
              ],
            ),
          ),
          Divider(height: 1),

          // Document List Section
          Expanded(
            flex: 2,
            child: ListView.builder(
              padding: EdgeInsets.symmetric(vertical: 8),
              itemCount: documents.length,
              itemBuilder: (context, index) {
                final doc = documents[index];
                final isSelected = doc.id == currentDocId;
                return Container(
                  margin: EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                  decoration: BoxDecoration(
                    color: isSelected ? Colors.blue[50] : Colors.transparent,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: ListTile(
                    dense: true,
                    title: Text(
                      doc.title,
                      style: TextStyle(
                        fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                        color: isSelected ? Colors.blue[900] : Colors.grey[800],
                        fontFamily: 'Rubik',
                      ),
                    ),
                    subtitle: Text(
                      'עדכון אחרון: ${doc.lastModified.hour}:${doc.lastModified.minute.toString().padLeft(2, '0')}',
                      style: TextStyle(fontSize: 10, color: Colors.grey[500]),
                    ),
                    leading: Icon(
                      Icons.article_outlined,
                      color: isSelected ? Colors.blue[700] : Colors.grey[500],
                    ),
                    trailing: documents.length > 1
                        ? IconButton(
                            icon: Icon(Icons.delete_outline, size: 16, color: Colors.red[300]),
                            onPressed: () => onDeleteDoc(doc.id),
                            tooltip: 'מחק מסמך',
                          )
                        : null,
                    onTap: () => onSelectDoc(doc.id),
                  ),
                );
              },
            ),
          ),
          Divider(height: 1),

          // Configuration settings section
          Expanded(
            flex: 3,
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Icon(Icons.settings_outlined, size: 18, color: Colors.grey[600]),
                      SizedBox(width: 8),
                      Text(
                        'הגדרות עימוד ועיצוב',
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.bold,
                          color: Colors.grey[700],
                          fontFamily: 'Rubik',
                        ),
                      ),
                    ],
                  ),
                  SizedBox(height: 16),

                  // Font selector
                  Text('גופן ברירת מחדל:', style: TextStyle(fontSize: 11, color: Colors.grey[600], fontWeight: FontWeight.bold)),
                  SizedBox(height: 6),
                  Container(
                    padding: EdgeInsets.symmetric(horizontal: 12),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      border: Border.all(color: Colors.grey[300]!),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: DropdownButtonHideUnderline(
                      child: DropdownButton<String>(
                        value: activeFont,
                        isExpanded: true,
                        items: [
                          DropdownMenuItem(value: 'Frank Ruhl Libre', child: Text('פרנק ריהל ליברה (סריף)')),
                          DropdownMenuItem(value: 'Rubik', child: Text('רוביק (סנס-סריף)')),
                        ],
                        onChanged: (val) {
                          if (val != null) onChangeFont(val);
                        },
                      ),
                    ),
                  ),
                  SizedBox(height: 16),

                  // Font Size
                  Row(
                    mainAxisAlignment: MainAxisAlignment.between,
                    children: [
                      Text('גודל גופן:', style: TextStyle(fontSize: 11, color: Colors.grey[600], fontWeight: FontWeight.bold)),
                      Text('${fontSize}px', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.blue[800])),
                    ],
                  ),
                  Slider(
                    value: fontSize.toDouble(),
                    min: 12,
                    max: 24,
                    divisions: 12,
                    onChanged: (val) => onChangeFontSize(val.toInt()),
                  ),

                  // Document Margins
                  Row(
                    mainAxisAlignment: MainAxisAlignment.between,
                    children: [
                      Text('שוליים:', style: TextStyle(fontSize: 11, color: Colors.grey[600], fontWeight: FontWeight.bold)),
                      Text('${margin}px', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.blue[800])),
                    ],
                  ),
                  Slider(
                    value: margin.toDouble(),
                    min: 10,
                    max: 60,
                    divisions: 10,
                    onChanged: (val) => onChangeMargin(val.toInt()),
                  ),

                  // Footnote configuration
                  Text('סגנון הערות שוליים:', style: TextStyle(fontSize: 11, color: Colors.grey[600], fontWeight: FontWeight.bold)),
                  SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton(
                          style: OutlinedButton.styleFrom(
                            backgroundColor: footnoteStyle == 'hierarchical' ? Colors.blue[50] : Colors.white,
                            side: BorderSide(
                              color: footnoteStyle == 'hierarchical' ? Colors.blue[400]! : Colors.grey[300]!,
                            ),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                            padding: EdgeInsets.symmetric(vertical: 10),
                          ),
                          onPressed: () => onChangeFootnoteStyle('hierarchical'),
                          child: Text(
                            'היררכי (1.1)',
                            style: TextStyle(
                              fontSize: 11,
                              color: footnoteStyle == 'hierarchical' ? Colors.blue[900] : Colors.grey[700],
                            ),
                          ),
                        ),
                      ),
                      SizedBox(width: 8),
                      Expanded(
                        child: OutlinedButton(
                          style: OutlinedButton.styleFrom(
                            backgroundColor: footnoteStyle == 'stacked' ? Colors.blue[50] : Colors.white,
                            side: BorderSide(
                              color: footnoteStyle == 'stacked' ? Colors.blue[400]! : Colors.grey[300]!,
                            ),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                            padding: EdgeInsets.symmetric(vertical: 10),
                          ),
                          onPressed: () => onChangeFootnoteStyle('stacked'),
                          child: Text(
                            'נערם (1, 2, 3)',
                            style: TextStyle(
                              fontSize: 11,
                              color: footnoteStyle == 'stacked' ? Colors.blue[900] : Colors.grey[700],
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),

                  Divider(height: 24, color: Colors.grey[200]),

                  // Custom Styles Management
                  Row(
                    mainAxisAlignment: MainAxisAlignment.between,
                    children: [
                      Row(
                        children: [
                          Icon(Icons.palette_outlined, size: 16, color: Colors.grey[600]),
                          SizedBox(width: 8),
                          Text(
                            'סגנונות מותאמים אישית',
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.bold,
                              color: Colors.grey[700],
                              fontFamily: 'Rubik',
                            ),
                          ),
                        ],
                      ),
                      IconButton(
                        icon: Icon(Icons.add_circle_outline, size: 18, color: Colors.blue[700]),
                        onPressed: onAddStyle,
                        tooltip: 'צור סגנון חדש',
                      ),
                    ],
                  ),
                  SizedBox(height: 8),

                  if (customStyles.isEmpty)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 8.0),
                      child: Text(
                        'אין סגנונות מוגדרים. לחץ על + כדי ליצור סגנון מותאם כמו בוורד.',
                        style: TextStyle(fontSize: 11, color: Colors.grey[400], fontFamily: 'Rubik'),
                      ),
                    )
                  else
                    ...customStyles.map((style) {
                      Color? parsedColor;
                      Color? parsedBgColor;
                      try {
                        if (style.color != null) {
                          final hex = style.color!.replaceAll('#', '');
                          parsedColor = Color(int.parse('0xff$hex'));
                        }
                      } catch (_) {}
                      try {
                        if (style.bgColor != null) {
                          final hex = style.bgColor!.replaceAll('#', '');
                          parsedBgColor = Color(int.parse('0xff$hex'));
                        }
                      } catch (_) {}

                      return Container(
                        margin: EdgeInsets.symmetric(vertical: 4),
                        decoration: BoxDecoration(
                          color: parsedBgColor ?? Colors.grey[50],
                          border: Border.all(
                            color: style.border != null ? Colors.brown[300]! : Colors.grey[300]!,
                            width: style.border != null ? 1.5 : 1.0,
                          ),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: InkWell(
                          onTap: () => onSelectStyle(style.name),
                          borderRadius: BorderRadius.circular(6),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.between,
                              children: [
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        style.name,
                                        style: TextStyle(
                                          fontFamily: style.fontFamily ?? 'Rubik',
                                          fontWeight: style.fontWeight == 'bold' ? FontWeight.bold : FontWeight.normal,
                                          fontSize: 12,
                                          color: parsedColor ?? Colors.grey[800],
                                        ),
                                      ),
                                      if (style.border != null || style.padding != null || style.fontSize != null)
                                        Padding(
                                          padding: const EdgeInsets.top(2.0),
                                          child: Text(
                                            '${style.isBlock == true ? 'בלוק' : 'טקסט'} • ${style.fontWeight ?? 'רגיל'}',
                                            style: TextStyle(fontSize: 9, color: Colors.grey[500]),
                                          ),
                                        ),
                                    ],
                                  ),
                                ),
                                Icon(Icons.arrow_back_ios_new, size: 10, color: Colors.grey[400]),
                              ],
                            ),
                          ),
                        ),
                      );
                    }).toList(),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
