import 'package:flutter/material.dart';

/// Custom Editing Controller that dynamically highlights or dims Ksav typesetting commands!
class KsavTextEditingController extends TextEditingController {
  final bool isProseMode;

  KsavTextEditingController({required this.isProseMode});

  @override
  TextSpan buildTextSpan({
    required BuildContext context,
    TextStyle? style,
    required bool withComposing,
  }) {
    final List<InlineSpan> children = [];
    final textVal = text;

    // Pattern to capture commands: #hebrew_word[ or brackets
    final RegExp regex = RegExp(r'(#[a-zA-Z0-9_\u0590-\u05ff]+\[)|(\])');

    int lastMatchEnd = 0;

    for (final RegExpMatch match in regex.allMatches(textVal)) {
      // Add plain text before match
      if (match.start > lastMatchEnd) {
        children.add(TextSpan(
          text: textVal.substring(lastMatchEnd, match.start),
          style: style,
        ));
      }

      final matchedText = match.group(0)!;
      final isClosingBracket = matchedText == ']';

      // Design style for command markers
      TextStyle markerStyle;
      if (isProseMode) {
        // Dim the markup to make it nearly invisible (distraction-free prose mode)
        markerStyle = TextStyle(
          color: Colors.grey[350],
          fontSize: style?.fontSize != null ? style!.fontSize! - 2.0 : 12.0,
          fontWeight: FontWeight.w300,
        );
      } else {
        // High contrast tech/code style for standard editing
        markerStyle = TextStyle(
          color: isClosingBracket ? Colors.purple[400] : Colors.blue[600],
          fontWeight: FontWeight.bold,
          fontFamily: 'Courier',
        );
      }

      children.add(TextSpan(
        text: matchedText,
        style: markerStyle,
      ));

      lastMatchEnd = match.end;
    }

    // Add trailing plain text
    if (lastMatchEnd < textVal.length) {
      children.add(TextSpan(
        text: textVal.substring(lastMatchEnd),
        style: style,
      ));
    }

    return TextSpan(children: children, style: style);
  }
}

class KsavProseEditor extends StatelessWidget {
  final KsavTextEditingController controller;
  final bool isProseMode;
  final FocusNode focusNode;

  KsavProseEditor({
    required this.controller,
    required this.isProseMode,
    required this.focusNode,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      color: Colors.white,
      padding: EdgeInsets.all(16),
      child: Directionality(
        textDirection: TextDirection.rtl,
        child: TextField(
          controller: controller,
          focusNode: focusNode,
          maxLines: null,
          keyboardType: TextInputType.multiline,
          style: TextStyle(
            fontSize: 15,
            height: 1.6,
            color: Colors.grey[800],
            fontFamily: isProseMode ? 'Rubik' : 'Courier',
          ),
          decoration: InputDecoration(
            border: InputBorder.none,
            hintText: 'הקלד כאן את הטקסט בעברית שלך...',
            hintStyle: TextStyle(
              color: Colors.grey[400],
              fontFamily: 'Rubik',
            ),
          ),
        ),
      ),
    );
  }
}
