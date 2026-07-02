import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

class KsavCustomStyle {
  final String name;
  final String? fontFamily;
  final String? fontSize;
  final String? color;
  final String? bgColor;
  final String? textAlign;
  final String? fontWeight;
  final String? textDecoration;
  final String? border;
  final String? padding;
  final bool? isBlock;

  KsavCustomStyle({
    required this.name,
    this.fontFamily,
    this.fontSize,
    this.color,
    this.bgColor,
    this.textAlign,
    this.fontWeight,
    this.textDecoration,
    this.border,
    this.padding,
    this.isBlock = false,
  });

  Map<String, dynamic> toJson() => {
        'name': name,
        if (fontFamily != null) 'fontFamily': fontFamily,
        if (fontSize != null) 'fontSize': fontSize,
        if (color != null) 'color': color,
        if (bgColor != null) 'bgColor': bgColor,
        if (textAlign != null) 'textAlign': textAlign,
        if (fontWeight != null) 'fontWeight': fontWeight,
        if (textDecoration != null) 'textDecoration': textDecoration,
        if (border != null) 'border': border,
        if (padding != null) 'padding': padding,
        'isBlock': isBlock,
      };

  factory KsavCustomStyle.fromJson(Map<String, dynamic> json) => KsavCustomStyle(
        name: json['name'],
        fontFamily: json['fontFamily'],
        fontSize: json['fontSize'],
        color: json['color'],
        bgColor: json['bgColor'],
        textAlign: json['textAlign'],
        fontWeight: json['fontWeight'],
        textDecoration: json['textDecoration'],
        border: json['border'],
        padding: json['padding'],
        isBlock: json['isBlock'] ?? false,
      );
}

final List<KsavCustomStyle> defaultCustomStyles = [
  KsavCustomStyle(
    name: 'הדגשה_זהב',
    color: '#b8860b',
    fontWeight: 'bold',
  ),
  KsavCustomStyle(
    name: 'מסגרת_תורנית',
    border: '2px double #8c6239',
    padding: '12px',
    bgColor: '#fffcf5',
    isBlock: true,
  ),
  KsavCustomStyle(
    name: 'הערת_רשי',
    fontFamily: 'Frank Ruhl Libre',
    fontSize: '0.85em',
    color: '#4a3728',
    isBlock: true,
  ),
];

class CustomStyleStore {
  static const String _key = 'ksav_custom_styles';

  static Future<List<KsavCustomStyle>> loadStyles() async {
    final prefs = await SharedPreferences.getInstance();
    final data = prefs.getString(_key);
    if (data == null) {
      await saveStyles(defaultCustomStyles);
      return defaultCustomStyles;
    }
    final List decoded = jsonDecode(data);
    return decoded.map((item) => KsavCustomStyle.fromJson(item)).toList();
  }

  static Future<void> saveStyles(List<KsavCustomStyle> styles) async {
    final prefs = await SharedPreferences.getInstance();
    final encoded = jsonEncode(styles.map((s) => s.toJson()).toList());
    await prefs.setString(_key, encoded);
  }
}
