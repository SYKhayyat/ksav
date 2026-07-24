import 'package:flutter/material.dart';
import '../models/style.dart';

class KsavToolbar extends StatefulWidget {
  final Function(String command) onInsertCommand;
  final List<KsavCustomStyle> customStyles;
  final VoidCallback onToggleSearch;
  final bool isSearchActive;

  KsavToolbar({
    required this.onInsertCommand,
    required this.customStyles,
    required this.onToggleSearch,
    required this.isSearchActive,
  });

  @override
  _KsavToolbarState createState() => _KsavToolbarState();
}

class _KsavToolbarState extends State<KsavToolbar> {
  int hoveredRow = 0;
  int hoveredCol = 0;

  void _handleSelectTableSize(int rows, int cols) {
    String tableMarkup = "טבלה[\n";
    // Header
    tableMarkup += "  #שורה[";
    for (int c = 1; c <= cols; c++) {
      tableMarkup += "#תא[עמודה $c]${c < cols ? ' ' : ''}";
    }
    tableMarkup += "]\n";

    // Data rows
    for (int r = 1; r < rows; r++) {
      tableMarkup += "  #שורה[";
      for (int c = 1; c <= cols; c++) {
        tableMarkup += "#תא[נתון]${c < cols ? ' ' : ''}";
      }
      tableMarkup += "]\n";
    }
    tableMarkup += "]";

    widget.onInsertCommand(tableMarkup);
    Navigator.of(context).pop(); // Dismiss grid dropdown
  }

  void _showTableGridMenu(BuildContext context) {
    showDialog(
      context: context,
      builder: (BuildContext ctx) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return AlertDialog(
              title: Text(
                'בחר ממדי טבלה',
                style: TextStyle(fontFamily: 'Rubik', fontSize: 14, fontWeight: FontWeight.bold),
                textAlign: TextAlign.right,
              ),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    hoveredRow > 0 && hoveredCol > 0
                        ? 'צור טבלה בגודל $hoveredRow x $hoveredCol'
                        : 'גרור ובחר גודל טבלה:',
                    style: TextStyle(fontFamily: 'Rubik', fontSize: 11, color: Colors.grey[600]),
                  ),
                  SizedBox(height: 12),
                  // 4x4 grid representation
                  Container(
                    width: 160,
                    height: 160,
                    child: GridView.builder(
                      shrinkWrap: true,
                      physics: NeverScrollableScrollPhysics(),
                      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 4,
                        crossAxisSpacing: 6,
                        mainAxisSpacing: 6,
                      ),
                      itemCount: 16,
                      itemBuilder: (context, idx) {
                        final r = (idx ~/ 4) + 1;
                        final c = (idx % 4) + 1;
                        final isHovered = r <= hoveredRow && c <= hoveredCol;
                        return MouseRegion(
                          onEnter: (_) {
                            setDialogState(() {
                              hoveredRow = r;
                              hoveredCol = c;
                            });
                          },
                          child: GestureDetector(
                            onTap: () => _handleSelectTableSize(r, c),
                            child: Container(
                              decoration: BoxDecoration(
                                color: isHovered ? Colors.blue[500] : Colors.grey[100],
                                border: Border.all(
                                  color: isHovered ? Colors.blue[600]! : Colors.grey[300]!,
                                ),
                                borderRadius: BorderRadius.circular(4),
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                  SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: () => _handleSelectTableSize(2, 2),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.grey[50],
                      foregroundColor: Colors.grey[800],
                      elevation: 0,
                      side: BorderSide(color: Colors.grey[300]!),
                    ),
                    child: Text('טבלה מהירה (2x2)', style: TextStyle(fontFamily: 'Rubik', fontSize: 11)),
                  ),
                ],
              ),
            );
          },
        );
      },
    ).then((_) {
      setState(() {
        hoveredRow = 0;
        hoveredCol = 0;
      });
    });
  }

  Widget _buildButton({
    required IconData icon,
    required String tooltip,
    required VoidCallback onPressed,
    bool isPrimary = false,
  }) {
    return Tooltip(
      message: tooltip,
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(6),
        child: Container(
          padding: EdgeInsets.all(6),
          decoration: BoxDecoration(
            color: isPrimary ? Colors.blue[50] : Colors.transparent,
            borderRadius: BorderRadius.circular(6),
          ),
          child: Icon(
            icon,
            size: 16,
            color: isPrimary ? Colors.blue[700] : Colors.grey[700],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 48,
      padding: EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border(
          bottom: BorderSide(color: Colors.grey[200]!, width: 1),
        ),
      ),
      child: Directionality(
        textDirection: TextDirection.rtl,
        child: SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              // Style modifiers
              _buildButton(
                icon: Icons.format_bold,
                tooltip: 'הדגשה (#הדגשה)',
                onPressed: () => widget.onInsertCommand('הדגשה'),
              ),
              _buildButton(
                icon: Icons.format_italic,
                tooltip: 'טקסט נטוי (#נטוי)',
                onPressed: () => widget.onInsertCommand('נטוי'),
              ),
              _buildButton(
                icon: Icons.format_underlined,
                tooltip: 'קו תחתון (#קו_תחתון)',
                onPressed: () => widget.onInsertCommand('קו_תחתון'),
              ),
              _buildButton(
                icon: Icons.strikethrough_s,
                tooltip: 'קו חוצה (#קו_חוצה)',
                onPressed: () => widget.onInsertCommand('קו_חוצה'),
              ),
              VerticalDivider(width: 16, indent: 12, endIndent: 12),

              // Alignments
              _buildButton(
                icon: Icons.format_align_right,
                tooltip: 'יישור לימין (#ימין)',
                onPressed: () => widget.onInsertCommand('ימין'),
              ),
              _buildButton(
                icon: Icons.format_align_center,
                tooltip: 'יישור למרכז (#מרכז)',
                onPressed: () => widget.onInsertCommand('מרכז'),
              ),
              _buildButton(
                icon: Icons.format_align_left,
                tooltip: 'יישור לשמאל (#שמאל)',
                onPressed: () => widget.onInsertCommand('שמאל'),
              ),
              VerticalDivider(width: 16, indent: 12, endIndent: 12),

              // Structure
              _buildButton(
                icon: Icons.looks_one,
                tooltip: 'כותרת ראשית (#כותרת1)',
                onPressed: () => widget.onInsertCommand('כותרת1'),
              ),
              _buildButton(
                icon: Icons.looks_two,
                tooltip: 'כותרת משנית (#כותרת2)',
                onPressed: () => widget.onInsertCommand('כותרת2'),
              ),
              VerticalDivider(width: 16, indent: 12, endIndent: 12),

              // Lists and Tables
              _buildButton(
                icon: Icons.format_list_bulleted,
                tooltip: 'רשימת פריטים (#רשימה)',
                onPressed: () => widget.onInsertCommand('רשימה'),
              ),
              _buildButton(
                icon: Icons.format_list_numbered,
                tooltip: 'רשימה ממוספרת (#רשימה_ממוספרת)',
                onPressed: () => widget.onInsertCommand('רשימה_ממוספרת'),
              ),
              _buildButton(
                icon: Icons.grid_on,
                tooltip: 'בנה טבלה מותאמת',
                onPressed: () => _showTableGridMenu(context),
              ),
              VerticalDivider(width: 16, indent: 12, endIndent: 12),

              // Footnotes
              _buildButton(
                icon: Icons.sticky_note_2_outlined,
                tooltip: 'הערת שוליים מקוננת (#הערה)',
                onPressed: () => widget.onInsertCommand('הערה'),
              ),
              _buildButton(
                icon: Icons.notes,
                tooltip: 'הערת שוליים שטוחה (#הערהשטוחה)',
                onPressed: () => widget.onInsertCommand('הערהשטוחה'),
              ),
              VerticalDivider(width: 16, indent: 12, endIndent: 12),

              // Custom Styles Menu
              PopupMenuButton<KsavCustomStyle>(
                tooltip: 'סגנונות מותאמים אישית (וורד)',
                icon: Icon(Icons.palette_outlined, size: 16, color: Colors.brown[600]),
                onSelected: (style) {
                  widget.onInsertCommand(style.name);
                },
                itemBuilder: (context) {
                  if (widget.customStyles.isEmpty) {
                    return [
                      PopupMenuItem<KsavCustomStyle>(
                        enabled: false,
                        child: Text(
                          'אין סגנונות מוגדרים',
                          style: TextStyle(fontFamily: 'Rubik', fontSize: 11, color: Colors.grey),
                        ),
                      )
                    ];
                  }
                  return widget.customStyles.map((style) {
                    Color? parsedColor;
                    try {
                      if (style.color != null) {
                        final hex = style.color!.replaceAll('#', '');
                        parsedColor = Color(int.parse('0xff$hex'));
                      }
                    } catch (_) {}

                    return PopupMenuItem<KsavCustomStyle>(
                      value: style,
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            style.name,
                            style: TextStyle(
                              fontFamily: 'Rubik',
                              fontSize: 12,
                              fontWeight: style.fontWeight == 'bold' ? FontWeight.bold : FontWeight.normal,
                              color: parsedColor ?? Colors.grey[800],
                            ),
                          ),
                          if (style.isBlock ?? false)
                            Icon(Icons.crop_square, size: 12, color: Colors.grey[500])
                          else
                            Icon(Icons.text_fields, size: 12, color: Colors.grey[500]),
                        ],
                      ),
                    );
                  }).toList();
                },
              ),
              VerticalDivider(width: 16, indent: 12, endIndent: 12),

              // Search & Replace Toggle
              _buildButton(
                icon: Icons.search,
                tooltip: 'חיפוש והחלפה ברגקס (Regex)',
                onPressed: widget.onToggleSearch,
                isPrimary: widget.isSearchActive,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
