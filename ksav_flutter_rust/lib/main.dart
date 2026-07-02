import 'package:flutter/material.dart';
import 'screens/home_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(KsavApp());
}

class KsavApp extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Ksav - Typesetting System',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        primarySwatch: Colors.blue,
        fontFamily: 'Rubik',
        scaffoldBackgroundColor: Colors.white,
        sliderTheme: SliderThemeData(
          activeTrackColor: Colors.blue[600],
          thumbColor: Colors.blue[700],
          overlayColor: Colors.blue[50],
        ),
      ),
      home: Directionality(
        textDirection: TextDirection.rtl, // Hebrew application RTL support
        child: KsavHomeScreen(),
      ),
    );
  }
}
