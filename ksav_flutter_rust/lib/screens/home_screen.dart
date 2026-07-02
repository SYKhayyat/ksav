import 'package:flutter/material.dart';
import 'dart:async';
import 'dart:convert';
import '../models/document.dart';
import '../models/style.dart';
import '../ffi/rust_ffi.dart';
import '../widgets/sidebar.dart';
import '../widgets/toolbar.dart';
import '../widgets/prose_editor.dart';
import '../widgets/live_preview.dart';

class KsavHomeScreen extends StatefulWidget {
  @override
  _KsavHomeScreenState createState() => _KsavHomeScreenState();
}

class _KsavHomeScreenState extends State<KsavHomeScreen> {
  List<KsavDocument> _documents = [];
  String _currentDocId = 'doc-letter';
  bool _loading = true;

  // Editor and Typesetting Configuration
  String _activeFont = 'Frank Ruhl Libre';
  int _fontSize = 16;
  int _margin = 32;
  String _footnoteStyle = 'hierarchical'; // "hierarchical" or "stacked"
  
  // Modes
  bool _isProseMode = false;
  bool _isSplitView = true;
  String _saveStatus = 'saved'; // 'saved', 'saving', 'dirty'

  // Custom Styles
  List<KsavCustomStyle> _customStyles = [];

  // Search & Replace state
  bool _isSearchVisible = false;
  final TextEditingController _findController = TextEditingController();
  final TextEditingController _replaceController = TextEditingController();
  bool _isRegex = false;
  List<int> _matchIndices = [];
  int _currentMatchIndex = -1;

  // Editor controller
  late KsavTextEditingController _editorController;

  // Compiled outputs
  String _compiledHtml = '';
  String _compiledTypst = '';

  final FocusNode _editorFocusNode = FocusNode();
  Timer? _debounceTimer;

  @override
  void initState() {
    super.initState();
    _initApp();
  }

  Future<void> _initApp() async {
    // 1. Initialize native FFI bindings
    RustEngine.initialize();

    // 2. Load custom styles
    final styles = await CustomStyleStore.loadStyles();

    // 3. Load documents from local disk store
    final docs = await DocumentStore.loadDocuments();
    final activeId = await DocumentStore.getActiveDocId() ?? docs[0].id;

    setState(() {
      _customStyles = styles;
      _documents = docs;
      _currentDocId = activeId;
      _editorController = KsavTextEditingController(isProseMode: _isProseMode);
      _editorController.text = _currentDoc.content;
      _loading = false;
    });

    _editorController.addListener(() {
      if (_editorController.text != _currentDoc.content) {
        _onContentChanged(_editorController.text);
      }
    });

    _recompileDocument();
  }

  KsavDocument get _currentDoc {
    return _documents.firstWhere(
      (doc) => doc.id == _currentDocId,
      orElse: () => _documents[0],
    );
  }

  /// Triggers the high-performance Rust compiler via Dart FFI to update the live preview
  void _recompileDocument() {
    final doc = _currentDoc;
    final stylesJson = jsonEncode(_customStyles.map((s) => s.toJson()).toList());
    
    // Call the Rust library for HTML & Typst typesetting compilation
    final html = RustEngine.parseAndRender(
      doc.content,
      doc.title,
      _activeFont,
      _fontSize,
      _margin,
      _footnoteStyle,
      stylesJson,
    );

    final typst = RustEngine.compileToTypst(doc.content);

    setState(() {
      _compiledHtml = html;
      _compiledTypst = typst;
    });
  }

  void _onContentChanged(String newText) {
    setState(() {
      _currentDoc.content = newText;
      _currentDoc.lastModified = DateTime.now();
      _saveStatus = 'dirty';
    });

    // Debounce compilation and saving for fluent typing performance
    if (_debounceTimer?.isActive ?? false) _debounceTimer!.cancel();
    _debounceTimer = Timer(Duration(milliseconds: 300), () {
      _recompileDocument();
      _saveCurrentDocuments();
    });
  }

  Future<void> _saveCurrentDocuments() async {
    setState(() {
      _saveStatus = 'saving';
    });

    await DocumentStore.saveDocuments(_documents);
    await DocumentStore.setActiveDocId(_currentDocId);

    setState(() {
      _saveStatus = 'saved';
    });
  }

  void _handleSelectDocument(String id) {
    setState(() {
      _currentDocId = id;
    });
    _editorController.text = _currentDoc.content;
    _recompileDocument();
    DocumentStore.setActiveDocId(id);
  }

  void _handleCreateDocument() {
    final newId = 'doc-${DateTime.now().millisecondsSinceEpoch}';
    final newDoc = KsavDocument(
      id: newId,
      title: 'מסמך חדש ${_documents.length + 1}',
      content: '#ימין[\nכתוב משהו מדהים כאן...\n]',
      lastModified: DateTime.now(),
    );

    setState(() {
      _documents.add(newDoc);
      _currentDocId = newId;
    });

    _editorController.text = newDoc.content;
    _recompileDocument();
    _saveCurrentDocuments();
  }

  void _handleDeleteDocument(String id) {
    if (_documents.length <= 1) return;

    setState(() {
      _documents.removeWhere((doc) => doc.id == id);
      if (_currentDocId == id) {
        _currentDocId = _documents[0].id;
      }
    });

    _editorController.text = _currentDoc.content;
    _recompileDocument();
    _saveCurrentDocuments();
  }

  /// Implements inserting/wrapping commands around cursor or appending
  void _handleInsertCommand(String cmd) {
    final controller = _editorController;
    final selection = controller.selection;
    final text = controller.text;

    String insertion = '';
    int selectOffset = 0;

    if (cmd == 'רשימה') {
      insertion = '#רשימה[\n  #פריט[פריט א]\n  #פריט[פריט ב]\n]';
    } else if (cmd == 'רשימה_ממוספרת') {
      insertion = '#רשימה_ממוספרת[\n  #פריט[פריט ראשון]\n  #פריט[פריט שני]\n]';
    } else if (cmd.contains('טבלה')) {
      insertion = cmd;
    } else {
      // It's a command! Check if it's a custom style or built-in command
      if (selection.isValid && !selection.isCollapsed) {
        final selectedText = text.substring(selection.start, selection.end);
        insertion = '#$cmd[$selectedText]';
      } else {
        insertion = '#$cmd[טקסט]';
        selectOffset = cmd.length + 2; // Length of "#cmd["
      }
    }

    if (selection.isValid) {
      final newText = text.replaceRange(selection.start, selection.end, insertion);
      controller.text = newText;
      
      // Position cursor
      if (selection.isCollapsed && selectOffset > 0) {
        controller.selection = TextSelection.collapsed(
          offset: selection.start + selectOffset,
        );
      } else {
        controller.selection = TextSelection.collapsed(
          offset: selection.start + insertion.length,
        );
      }
    } else {
      final newText = '$text\n$insertion';
      controller.text = newText;
    }
    
    _onContentChanged(controller.text);
  }

  // Regex Find and Replace engine
  void _performSearch() {
    final query = _findController.text;
    if (query.isEmpty) {
      setState(() {
        _matchIndices = [];
        _currentMatchIndex = -1;
      });
      return;
    }

    final text = _editorController.text;
    List<int> indices = [];
    
    try {
      if (_isRegex) {
        final regExp = RegExp(query, caseSensitive: false, unicode: true);
        for (final match in regExp.allMatches(text)) {
          indices.add(match.start);
        }
      } else {
        int index = text.indexOf(query);
        while (index != -1) {
          indices.add(index);
          index = text.indexOf(query, index + query.length);
        }
      }
    } catch (e) {
      print('Invalid regex query: $e');
    }

    setState(() {
      _matchIndices = indices;
      if (indices.isNotEmpty) {
        _currentMatchIndex = 0;
        _highlightMatch(indices[0], query.length);
      } else {
        _currentMatchIndex = -1;
      }
    });
  }

  void _highlightMatch(int start, int length) {
    _editorController.selection = TextSelection(
      baseOffset: start,
      extentOffset: start + length,
    );
    _editorFocusNode.requestFocus();
  }

  void _goToNextMatch() {
    if (_matchIndices.isEmpty) return;
    setState(() {
      _currentMatchIndex = (_currentMatchIndex + 1) % _matchIndices.length;
    });
    // Calculate length of the query or match length if regex
    int len = _findController.text.length;
    if (_isRegex) {
      try {
        final regExp = RegExp(_findController.text, caseSensitive: false, unicode: true);
        final matches = regExp.allMatches(_editorController.text).toList();
        if (_currentMatchIndex < matches.length) {
          len = matches[_currentMatchIndex].end - matches[_currentMatchIndex].start;
        }
      } catch (_) {}
    }
    _highlightMatch(_matchIndices[_currentMatchIndex], len);
  }

  void _goToPrevMatch() {
    if (_matchIndices.isEmpty) return;
    setState(() {
      _currentMatchIndex = (_currentMatchIndex - 1 + _matchIndices.length) % _matchIndices.length;
    });
    int len = _findController.text.length;
    if (_isRegex) {
      try {
        final regExp = RegExp(_findController.text, caseSensitive: false, unicode: true);
        final matches = regExp.allMatches(_editorController.text).toList();
        if (_currentMatchIndex < matches.length) {
          len = matches[_currentMatchIndex].end - matches[_currentMatchIndex].start;
        }
      } catch (_) {}
    }
    _highlightMatch(_matchIndices[_currentMatchIndex], len);
  }

  void _replaceCurrent() {
    if (_matchIndices.isEmpty || _currentMatchIndex == -1) return;
    final text = _editorController.text;
    final start = _matchIndices[_currentMatchIndex];
    int len = _findController.text.length;
    if (_isRegex) {
      try {
        final regExp = RegExp(_findController.text, caseSensitive: false, unicode: true);
        final matches = regExp.allMatches(text).toList();
        if (_currentMatchIndex < matches.length) {
          len = matches[_currentMatchIndex].end - matches[_currentMatchIndex].start;
        }
      } catch (_) {}
    }

    final replacement = _replaceController.text;
    final newText = text.replaceRange(start, start + len, replacement);
    _editorController.text = newText;
    
    _performSearch();
  }

  void _replaceAll() {
    final query = _findController.text;
    if (query.isEmpty) return;
    final text = _editorController.text;
    final replacement = _replaceController.text;
    
    String newText;
    if (_isRegex) {
      try {
        final regExp = RegExp(query, caseSensitive: false, unicode: true);
        newText = text.replaceAll(regExp, replacement);
      } catch (e) {
        newText = text;
      }
    } else {
      newText = text.replaceAll(query, replacement);
    }

    _editorController.text = newText;
    _performSearch();
  }

  // Word-like Custom Style Designer Dialog
  void _showAddStyleDialog() {
    final nameController = TextEditingController();
    final fontController = TextEditingController(text: 'Rubik');
    final sizeController = TextEditingController(text: '1.0em');
    final colorController = TextEditingController(text: '#1a1a1a');
    final bgColorController = TextEditingController();
    final borderController = TextEditingController();
    final paddingController = TextEditingController();
    String fontWeight = 'normal';
    String textDecoration = 'none';
    bool isBlock = false;

    showDialog(
      context: context,
      builder: (BuildContext ctx) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return AlertDialog(
              title: Text(
                'יצירת סגנון מותאם אישית (וורד)',
                style: TextStyle(fontFamily: 'Rubik', fontSize: 16, fontWeight: FontWeight.bold),
                textAlign: TextAlign.right,
              ),
              content: SingleChildScrollView(
                child: Directionality(
                  textDirection: TextDirection.rtl,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      TextField(
                        controller: nameController,
                        style: TextStyle(fontFamily: 'Rubik', fontSize: 13),
                        decoration: InputDecoration(
                          labelText: 'שם הסגנון (בעברית ללא רווחים)',
                          labelStyle: TextStyle(fontSize: 11),
                          hintText: 'לדוגמה: הדגשה_כחולה',
                        ),
                      ),
                      SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: DropdownButtonFormField<String>(
                              value: fontController.text,
                              decoration: InputDecoration(labelText: 'גופן', labelStyle: TextStyle(fontSize: 11)),
                              style: TextStyle(fontFamily: 'Rubik', fontSize: 12, color: Colors.black),
                              items: [
                                DropdownMenuItem(value: 'Frank Ruhl Libre', child: Text('סריף')),
                                DropdownMenuItem(value: 'Rubik', child: Text('סנס-סריף')),
                              ],
                              onChanged: (val) {
                                if (val != null) setDialogState(() => fontController.text = val);
                              },
                            ),
                          ),
                          SizedBox(width: 12),
                          Expanded(
                            child: TextField(
                              controller: sizeController,
                              style: TextStyle(fontFamily: 'Rubik', fontSize: 12),
                              decoration: InputDecoration(
                                labelText: 'גודל (למשל 1.2em או 18px)',
                                labelStyle: TextStyle(fontSize: 11),
                              ),
                            ),
                          ),
                        ],
                      ),
                      SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: TextField(
                              controller: colorController,
                              style: TextStyle(fontFamily: 'Rubik', fontSize: 12),
                              decoration: InputDecoration(
                                labelText: 'צבע גופן (Hex)',
                                labelStyle: TextStyle(fontSize: 11),
                                hintText: '#000000',
                              ),
                            ),
                          ),
                          SizedBox(width: 12),
                          Expanded(
                            child: TextField(
                              controller: bgColorController,
                              style: TextStyle(fontFamily: 'Rubik', fontSize: 12),
                              decoration: InputDecoration(
                                labelText: 'צבע רקע (Hex)',
                                labelStyle: TextStyle(fontSize: 11),
                                hintText: '#ffffff',
                              ),
                            ),
                          ),
                        ],
                      ),
                      SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: DropdownButtonFormField<String>(
                              value: fontWeight,
                              decoration: InputDecoration(labelText: 'משקל', labelStyle: TextStyle(fontSize: 11)),
                              style: TextStyle(fontFamily: 'Rubik', fontSize: 12, color: Colors.black),
                              items: [
                                DropdownMenuItem(value: 'normal', child: Text('רגיל')),
                                DropdownMenuItem(value: 'bold', child: Text('מודגש (Bold)')),
                              ],
                              onChanged: (val) {
                                if (val != null) setDialogState(() => fontWeight = val);
                              },
                            ),
                          ),
                          SizedBox(width: 12),
                          Expanded(
                            child: DropdownButtonFormField<String>(
                              value: textDecoration,
                              decoration: InputDecoration(labelText: 'קו עיטור', labelStyle: TextStyle(fontSize: 11)),
                              style: TextStyle(fontFamily: 'Rubik', fontSize: 12, color: Colors.black),
                              items: [
                                DropdownMenuItem(value: 'none', child: Text('ללא')),
                                DropdownMenuItem(value: 'underline', child: Text('קו תחתון')),
                                DropdownMenuItem(value: 'line-through', child: Text('קו חוצה')),
                              ],
                              onChanged: (val) {
                                if (val != null) setDialogState(() => textDecoration = val);
                              },
                            ),
                          ),
                        ],
                      ),
                      SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: TextField(
                              controller: borderController,
                              style: TextStyle(fontFamily: 'Rubik', fontSize: 12),
                              decoration: InputDecoration(
                                labelText: 'מסגרת (CSS Border)',
                                labelStyle: TextStyle(fontSize: 11),
                                hintText: '2px double #8c6239',
                              ),
                            ),
                          ),
                          SizedBox(width: 12),
                          Expanded(
                            child: TextField(
                              controller: paddingController,
                              style: TextStyle(fontFamily: 'Rubik', fontSize: 12),
                              decoration: InputDecoration(
                                labelText: 'מרווח פנימי (CSS Padding)',
                                labelStyle: TextStyle(fontSize: 11),
                                hintText: '8px 12px',
                              ),
                            ),
                          ),
                        ],
                      ),
                      SizedBox(height: 12),
                      CheckboxListTile(
                        title: Text('סגנון בלוק (שורת פסקה נפרדת)', style: TextStyle(fontFamily: 'Rubik', fontSize: 12)),
                        dense: true,
                        value: isBlock,
                        onChanged: (val) {
                          if (val != null) setDialogState(() => isBlock = val);
                        },
                      ),
                    ],
                  ),
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(ctx).pop(),
                  child: Text('ביטול', style: TextStyle(fontFamily: 'Rubik')),
                ),
                ElevatedButton(
                  onPressed: () async {
                    final name = nameController.text.trim();
                    if (name.isEmpty) return;

                    final newStyle = KsavCustomStyle(
                      name: name,
                      fontFamily: fontController.text,
                      fontSize: sizeController.text.isNotEmpty ? sizeController.text : null,
                      color: colorController.text.isNotEmpty ? colorController.text : null,
                      bgColor: bgColorController.text.isNotEmpty ? bgColorController.text : null,
                      fontWeight: fontWeight,
                      textDecoration: textDecoration != 'none' ? textDecoration : null,
                      border: borderController.text.isNotEmpty ? borderController.text : null,
                      padding: paddingController.text.isNotEmpty ? paddingController.text : null,
                      isBlock: isBlock,
                    );

                    setState(() {
                      _customStyles.add(newStyle);
                    });

                    await CustomStyleStore.saveStyles(_customStyles);
                    _recompileDocument();
                    Navigator.of(ctx).pop();
                  },
                  child: Text('צור סגנון', style: TextStyle(fontFamily: 'Rubik')),
                ),
              ],
            );
          },
        );
      },
    );
  }

  Widget _buildFindReplacePanel() {
    if (!_isSearchVisible) return SizedBox.shrink();

    return Container(
      padding: EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.grey[50],
        border: Border(
          bottom: BorderSide(color: Colors.grey[200]!),
        ),
      ),
      child: Directionality(
        textDirection: TextDirection.rtl,
        child: Column(
          children: [
            Row(
              children: [
                // Find Input
                Expanded(
                  child: TextField(
                    controller: _findController,
                    onChanged: (_) => _performSearch(),
                    style: TextStyle(fontSize: 12, fontFamily: 'Rubik'),
                    decoration: InputDecoration(
                      labelText: 'חפש טקסט...',
                      labelStyle: TextStyle(fontSize: 10, fontFamily: 'Rubik'),
                      isDense: true,
                      contentPadding: EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(4)),
                      suffixIcon: _findController.text.isNotEmpty
                          ? IconButton(
                              icon: Icon(Icons.clear, size: 14),
                              onPressed: () {
                                _findController.clear();
                                _performSearch();
                              },
                            )
                          : null,
                    ),
                  ),
                ),
                SizedBox(width: 8),

                // Regex checkbox
                Row(
                  children: [
                    Checkbox(
                      value: _isRegex,
                      onChanged: (val) {
                        setState(() {
                          _isRegex = val ?? false;
                        });
                        _performSearch();
                      },
                    ),
                    Text('רגקס (Regex)', style: TextStyle(fontSize: 11, fontFamily: 'Rubik')),
                  ],
                ),
                SizedBox(width: 12),

                // Match counts
                if (_findController.text.isNotEmpty)
                  Text(
                    _matchIndices.isEmpty
                        ? 'אין תוצאות'
                        : '${_currentMatchIndex + 1} מתוך ${_matchIndices.length}',
                    style: TextStyle(
                      fontSize: 11,
                      fontFamily: 'Rubik',
                      color: _matchIndices.isEmpty ? Colors.red : Colors.green[800],
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                SizedBox(width: 12),

                // Navigation buttons
                IconButton(
                  icon: Icon(Icons.keyboard_arrow_up, size: 18),
                  onPressed: _goToPrevMatch,
                  tooltip: 'הקודם',
                ),
                IconButton(
                  icon: Icon(Icons.keyboard_arrow_down, size: 18),
                  onPressed: _goToNextMatch,
                  tooltip: 'הבא',
                ),
                IconButton(
                  icon: Icon(Icons.close, size: 18, color: Colors.grey[600]),
                  onPressed: () {
                    setState(() {
                      _isSearchVisible = false;
                      _matchIndices = [];
                      _currentMatchIndex = -1;
                    });
                  },
                  tooltip: 'סגור פאנל',
                ),
              ],
            ),
            SizedBox(height: 8),
            Row(
              children: [
                // Replace Input
                Expanded(
                  child: TextField(
                    controller: _replaceController,
                    style: TextStyle(fontSize: 12, fontFamily: 'Rubik'),
                    decoration: InputDecoration(
                      labelText: 'החלף ב...',
                      labelStyle: TextStyle(fontSize: 10, fontFamily: 'Rubik'),
                      isDense: true,
                      contentPadding: EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(4)),
                    ),
                  ),
                ),
                SizedBox(width: 12),

                // Replace buttons
                ElevatedButton(
                  onPressed: _replaceCurrent,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.blue[50],
                    foregroundColor: Colors.blue[900],
                    elevation: 0,
                    padding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
                  ),
                  child: Text('החלף', style: TextStyle(fontSize: 11, fontFamily: 'Rubik')),
                ),
                SizedBox(width: 8),
                ElevatedButton(
                  onPressed: _replaceAll,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.blue[800],
                    foregroundColor: Colors.white,
                    elevation: 0,
                    padding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
                  ),
                  child: Text('החלף הכל', style: TextStyle(fontSize: 11, fontFamily: 'Rubik')),
                ),
              ],
            )
          ],
        ),
      ),
    );
  }

  @override
  void dispose() {
    _debounceTimer?.cancel();
    _editorFocusNode.dispose();
    _findController.dispose();
    _replaceController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return Scaffold(
        body: Center(
          child: CircularProgressIndicator(),
        ),
      );
    }

    final doc = _currentDoc;

    return Scaffold(
      backgroundColor: Colors.white,
      body: Row(
        children: [
          // 1. Collapsible Sidebar
          KsavSidebar(
            documents: _documents,
            currentDocId: _currentDocId,
            onSelectDoc: _handleSelectDocument,
            onCreateDoc: _handleCreateDocument,
            onDeleteDoc: _handleDeleteDocument,
            activeFont: _activeFont,
            onChangeFont: (font) {
              setState(() => _activeFont = font);
              _recompileDocument();
            },
            fontSize: _fontSize,
            onChangeFontSize: (sz) {
              setState(() => _fontSize = sz);
              _recompileDocument();
            },
            margin: _margin,
            onChangeMargin: (m) {
              setState(() => _margin = m);
              _recompileDocument();
            },
            footnoteStyle: _footnoteStyle,
            onChangeFootnoteStyle: (style) {
              setState(() => _footnoteStyle = style);
              _recompileDocument();
            },
            customStyles: _customStyles,
            onAddStyle: _showAddStyleDialog,
            onSelectStyle: (styleName) {
              _handleInsertCommand(styleName);
            },
          ),

          // 2. Main Work Area (Editor + Toolbar + Live Preview)
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Top Document bar
                Container(
                  height: 56,
                  padding: EdgeInsets.symmetric(horizontal: 16),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    border: Border(bottom: BorderSide(color: Colors.grey[200]!)),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.between,
                    children: [
                      // Document Title Input Field
                      Expanded(
                        child: Container(
                          maxWidth: 300,
                          child: TextField(
                            controller: TextEditingController(text: doc.title)
                              ..selection = TextSelection.fromPosition(
                                TextPosition(offset: doc.title.length),
                              ),
                            onChanged: (val) {
                              setState(() {
                                doc.title = val;
                                _saveStatus = 'dirty';
                              });
                              _debounceTimer?.cancel();
                              _debounceTimer = Timer(Duration(milliseconds: 500), () {
                                _recompileDocument();
                                _saveCurrentDocuments();
                              });
                            },
                            style: TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.bold,
                              fontFamily: 'Rubik',
                              color: Colors.grey[800],
                            ),
                            decoration: InputDecoration(
                              hintText: 'כותרת מסמך',
                              border: InputBorder.none,
                              prefixIcon: Icon(Icons.edit, size: 14, color: Colors.blue[600]),
                            ),
                          ),
                        ),
                      ),

                      // Mode Switch buttons
                      Row(
                        children: [
                          // Saving indicator
                          Container(
                            padding: EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(
                              color: _saveStatus == 'saved' ? Colors.green[50] : Colors.amber[50],
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Row(
                              children: [
                                Container(
                                  width: 6,
                                  height: 6,
                                  decoration: BoxDecoration(
                                    color: _saveStatus == 'saved' ? Colors.green : Colors.amber,
                                    shape: BoxShape.circle,
                                  ),
                                ),
                                SizedBox(width: 6),
                                Text(
                                  _saveStatus == 'saved'
                                      ? 'שמור בענן מקומי'
                                      : _saveStatus == 'saving'
                                          ? 'שומר...'
                                          : 'שינויים לא שמורים',
                                  style: TextStyle(
                                    fontSize: 9,
                                    fontFamily: 'Rubik',
                                    color: _saveStatus == 'saved' ? Colors.green[900] : Colors.amber[900],
                                  ),
                                )
                              ],
                            ),
                          ),
                          SizedBox(width: 16),

                          // Toggle Prose Mode
                          ElevatedButton.icon(
                            onPressed: () {
                              setState(() {
                                _isProseMode = !_isProseMode;
                              });
                            },
                            icon: Icon(_isProseMode ? Icons.border_color : Icons.text_fields, size: 14),
                            label: Text(
                              _isProseMode ? 'בטל מצב פרוזה' : 'מצב פרוזה',
                              style: TextStyle(fontSize: 10, fontFamily: 'Rubik'),
                            ),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: _isProseMode ? Colors.amber[50] : Colors.grey[50],
                              foregroundColor: _isProseMode ? Colors.amber[900] : Colors.grey[700],
                              elevation: 0,
                              side: BorderSide(color: _isProseMode ? Colors.amber[300]! : Colors.grey[300]!),
                            ),
                          ),
                          SizedBox(width: 8),

                          // Toggle Split View
                          ElevatedButton.icon(
                            onPressed: () {
                              setState(() {
                                _isSplitView = !_isSplitView;
                              });
                            },
                            icon: Icon(_isSplitView ? Icons.fullscreen : Icons.splitscreen, size: 14),
                            label: Text(
                              _isSplitView ? 'הסתר תצוגה מקדימה' : 'תצוגה מפוצלת',
                              style: TextStyle(fontSize: 10, fontFamily: 'Rubik'),
                            ),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: _isSplitView ? Colors.blue[50] : Colors.grey[50],
                              foregroundColor: _isSplitView ? Colors.blue[900] : Colors.grey[700],
                              elevation: 0,
                              side: BorderSide(color: _isSplitView ? Colors.blue[300]! : Colors.grey[300]!),
                            ),
                          ),
                        ],
                      )
                    ],
                  ),
                ),

                // Formatting Toolbar
                KsavToolbar(
                  onInsertCommand: _handleInsertCommand,
                  customStyles: _customStyles,
                  onToggleSearch: () {
                    setState(() {
                      _isSearchVisible = !_isSearchVisible;
                    });
                  },
                  isSearchActive: _isSearchVisible,
                ),

                // Find & Replace Panel
                _buildFindReplacePanel(),

                // Main Editor split container
                Expanded(
                  child: Row(
                    children: [
                      // Source Code and Prose Editor
                      Expanded(
                        child: KsavProseEditor(
                          controller: _editorController,
                          isProseMode: _isProseMode,
                          focusNode: _editorFocusNode,
                        ),
                      ),

                      // Live Render Preview
                      if (_isSplitView)
                        Expanded(
                          child: KsavLivePreview(
                            compiledHtml: _compiledHtml,
                            typstMarkup: _compiledTypst,
                            isSplitView: _isSplitView,
                          ),
                        ),
                    ],
                  ),
                ),

                // Statistics bottom footer
                Container(
                  height: 32,
                  padding: EdgeInsets.symmetric(horizontal: 16),
                  decoration: BoxDecoration(
                    color: Colors.grey[50],
                    border: Border(top: BorderSide(color: Colors.grey[200]!)),
                  ),
                  child: Directionality(
                    textDirection: TextDirection.rtl,
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.between,
                      children: [
                        Row(
                          children: [
                            Icon(Icons.wifi_off, size: 14, color: Colors.green),
                            SizedBox(width: 6),
                            Text(
                              'מצב מקומי ואופליין מלא פעיל',
                              style: TextStyle(fontSize: 10, fontFamily: 'Rubik', color: Colors.green[800], fontWeight: FontWeight.bold),
                            ),
                            SizedBox(width: 16),
                            Text('תווים: ${doc.content.length}', style: TextStyle(fontSize: 10, color: Colors.grey[600])),
                            SizedBox(width: 12),
                            Text('מילים: ${doc.content.split(RegExp(r'\s+')).where((s) => s.isNotEmpty).length}', style: TextStyle(fontSize: 10, color: Colors.grey[600])),
                          ],
                        ),
                        Text(
                          'קסב עימוד עברי • מבוסס מנוע Rust מהיר',
                          style: TextStyle(fontSize: 10, fontFamily: 'Rubik', color: Colors.grey[400]),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
