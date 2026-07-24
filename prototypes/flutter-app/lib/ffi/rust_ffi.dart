import 'dart:ffi';
import 'dart:io';
import 'package:ffi/ffi.dart';

// FFI Signatures in C
typedef ParseAndRenderC = Pointer<Utf8> Function(
  Pointer<Utf8> src,
  Pointer<Utf8> title,
  Pointer<Utf8> fontFamily,
  IntPtr fontSize,
  IntPtr margin,
  Pointer<Utf8> footnoteStyle,
  Pointer<Utf8> customStylesJson,
);

typedef ParseToTypstC = Pointer<Utf8> Function(
  Pointer<Utf8> src,
);

typedef FreeStringC = Void Function(
  Pointer<Utf8> ptr,
);

// Dart Signatures
typedef ParseAndRenderDart = Pointer<Utf8> Function(
  Pointer<Utf8> src,
  Pointer<Utf8> title,
  Pointer<Utf8> fontFamily,
  int fontSize,
  int margin,
  Pointer<Utf8> footnoteStyle,
  Pointer<Utf8> customStylesJson,
);

typedef ParseToTypstDart = Pointer<Utf8> Function(
  Pointer<Utf8> src,
);

typedef FreeStringDart = void Function(
  Pointer<Utf8> ptr,
);

class RustEngine {
  static late DynamicLibrary _lib;
  static late ParseAndRenderDart _parseAndRender;
  static late ParseToTypstDart _parseToTypst;
  static late FreeStringDart _freeString;
  static bool _initialized = false;

  /// Loads the native library. Falls back gracefully to pure Dart parser if library not found (useful for testing/mock runs).
  static void initialize() {
    if (_initialized) return;
    try {
      if (Platform.isAndroid) {
        _lib = DynamicLibrary.open('libksav_engine.so');
      } else if (Platform.isIOS || Platform.isMacOS) {
        _lib = DynamicLibrary.process(); // Statically linked or bundled
      } else if (Platform.isWindows) {
        _lib = DynamicLibrary.open('ksav_engine.dll');
      } else if (Platform.isLinux) {
        _lib = DynamicLibrary.open('libksav_engine.so');
      } else {
        throw UnsupportedError('Unsupported platform');
      }

      _parseAndRender = _lib
          .lookup<NativeFunction<ParseAndRenderC>>('parse_and_render_to_html')
          .asFunction();

      _parseToTypst = _lib
          .lookup<NativeFunction<ParseToTypstC>>('parse_to_typst')
          .asFunction();

      _freeString = _lib
          .lookup<NativeFunction<FreeStringC>>('free_string')
          .asFunction();

      _initialized = true;
      print('Ksav Rust Engine initialized successfully via FFI.');
    } catch (e) {
      print('Warning: Failed to load Ksav Rust Engine ($e). Using Dart fallback parser.');
      _initialized = false;
    }
  }

  /// Parses Ksav markup and renders complete styled HTML
  static String parseAndRender(
    String src,
    String title,
    String fontFamily,
    int fontSize,
    int margin,
    String footnoteStyle,
    String customStylesJson,
  ) {
    if (!_initialized) {
      // Dart Fallback Implementation in case native FFI is missing during dev
      return _dartFallbackRender(src, title, fontFamily, fontSize, margin, footnoteStyle);
    }

    final srcPointer = src.toNativeUtf8();
    final titlePointer = title.toNativeUtf8();
    final fontPointer = fontFamily.toNativeUtf8();
    final fnStylePointer = footnoteStyle.toNativeUtf8();
    final customStylesPointer = customStylesJson.toNativeUtf8();

    final resultPointer = _parseAndRender(
      srcPointer,
      titlePointer,
      fontPointer,
      fontSize,
      margin,
      fnStylePointer,
      customStylesPointer,
    );

    final htmlResult = resultPointer.toDartString();

    // Prevent memory leaks on Rust's heap
    _freeString(resultPointer);
    malloc.free(srcPointer);
    malloc.free(titlePointer);
    malloc.free(fontPointer);
    malloc.free(fnStylePointer);
    malloc.free(customStylesPointer);

    return htmlResult;
  }

  /// Parses Ksav markup and translates it to standard Typst markup
  static String compileToTypst(String src) {
    if (!_initialized) {
      return '// Dart Typst Fallback\n$src';
    }

    final srcPointer = src.toNativeUtf8();
    final resultPointer = _parseToTypst(srcPointer);
    final typstResult = resultPointer.toDartString();

    _freeString(resultPointer);
    malloc.free(srcPointer);

    return typstResult;
  }

  /// Simple Dart fallback parsing in case FFI isn't loaded (e.g., standard emulator testing)
  static String _dartFallbackRender(
    String src,
    String title,
    String fontFamily,
    int fontSize,
    int margin,
    String footnoteStyle,
  ) {
    // Quick inline HTML builder mirroring the Rust parser layout for seamless fallback operation
    String contentHtml = src
        .replaceAll('\n', '<br/>')
        .replaceAll('#הדגשה[', '<strong>')
        .replaceAll('#נטוי[', '<em>')
        .replaceAll('#קו_תחתון[', '<u>')
        .replaceAll(']', '</strong></u></em>');

    return '''
    <!DOCTYPE html>
    <html lang="he" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: '$fontFamily', sans-serif; font-size: ${fontSize}px; padding: ${margin}px; direction: rtl; text-align: justify; }
      </style>
    </head>
    <body>
      <h2>$title</h2>
      <div>$contentHtml</div>
    </body>
    </html>
    ''';
  }
}
