import 'package:flutter/material.dart';
import 'package:flutter_html/flutter_html.dart';
import 'package:flutter/services.dart';

class KsavLivePreview extends StatelessWidget {
  final String compiledHtml;
  final String typstMarkup;
  final bool isSplitView;

  KsavLivePreview({
    required this.compiledHtml,
    required this.typstMarkup,
    required this.isSplitView,
  });

  void _copyToClipboard(BuildContext context, String text, String type) {
    Clipboard.setData(ClipboardData(text: text));
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          'הועתק בהצלחה קוד $type!',
          textAlign: TextAlign.right,
          style: TextStyle(fontFamily: 'Rubik'),
        ),
        duration: Duration(seconds: 1.5),
        backgroundColor: Colors.green[800],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border(
          right: BorderSide(color: Colors.grey[200]!, width: 1),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Header / Utility bar
          Container(
            height: 48,
            padding: EdgeInsets.symmetric(horizontal: 16),
            color: Colors.grey[50],
            child: Row(
              mainAxisAlignment: MainAxisAlignment.between,
              children: [
                Row(
                  children: [
                    Icon(Icons.visibility_outlined, size: 16, color: Colors.blue[800]),
                    SizedBox(width: 8),
                    Text(
                      'תצוגה מקדימה אופליין (מבוסס Rust)',
                      style: TextStyle(
                        fontFamily: 'Rubik',
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                        color: Colors.grey[700],
                      ),
                    ),
                  ],
                ),
                Row(
                  children: [
                    ElevatedButton.icon(
                      onPressed: () => _copyToClipboard(context, typstMarkup, 'Typst'),
                      icon: Icon(Icons.code, size: 14),
                      label: Text('העתק קוד Typst', style: TextStyle(fontSize: 10, fontFamily: 'Rubik')),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.blue[50],
                        foregroundColor: Colors.blue[900],
                        elevation: 0,
                        padding: EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                      ),
                    ),
                    SizedBox(width: 8),
                    ElevatedButton.icon(
                      onPressed: () => _copyToClipboard(context, compiledHtml, 'HTML'),
                      icon: Icon(Icons.html, size: 14),
                      label: Text('העתק HTML', style: TextStyle(fontSize: 10, fontFamily: 'Rubik')),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.grey[100],
                        foregroundColor: Colors.grey[800],
                        elevation: 0,
                        padding: EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          Divider(height: 1),

          // HTML Render body
          Expanded(
            child: Directionality(
              textDirection: TextDirection.rtl,
              child: SingleChildScrollView(
                padding: EdgeInsets.all(24),
                child: Html(
                  data: compiledHtml,
                  style: {
                    "body": Style(
                      margin: Margins.zero(),
                      padding: HtmlPaddings.zero(),
                      textAlign: TextAlign.justify,
                    ),
                    "h1": Style(
                      fontFamily: 'Frank Ruhl Libre',
                      color: Colors.grey[900],
                      border: Border(bottom: BorderSide(color: Colors.grey[200]!)),
                    ),
                    "h2": Style(
                      fontFamily: 'Frank Ruhl Libre',
                      color: Colors.grey[800],
                    ),
                    "strong": Style(
                      fontWeight: FontWeight.bold,
                    ),
                    "table": Style(
                      width: Width(100, Unit.percent),
                      border: Border.all(color: Colors.grey[300]!),
                      margin: Margins.symmetric(vertical: 16),
                    ),
                    "td": Style(
                      border: Border.all(color: Colors.grey[200]!),
                      padding: HtmlPaddings.all(8),
                      textAlign: TextAlign.right,
                    ),
                    ".footnotes-section": Style(
                      marginTop: Height(32),
                      color: Colors.grey[700],
                      fontFamily: 'Frank Ruhl Libre',
                    ),
                    ".footnotes-divider": Style(
                      width: Width(25, Unit.percent),
                      border: Border(top: BorderSide(color: Colors.grey[400]!)),
                    ),
                  },
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
