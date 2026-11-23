import os, shutil

# 1. Fixed debug keystore so SHA-1 is ALWAYS 66:59:03:B8:0F:FD:6E:8F:03:F5:29:74:14:F5:5F:1B:AF:48:55:E2
os.makedirs(os.path.expanduser("~/.android"), exist_ok=True)
shutil.copy("native-android/brisaplan-debug.keystore", os.path.expanduser("~/.android/debug.keystore"))
shutil.copy("native-android/brisaplan-debug.keystore", "android/app/debug.keystore")

# 2. Enforce signingConfigs.debug in android/app/build.gradle
gradle_path = "android/app/build.gradle"
with open(gradle_path, "r", encoding="utf-8") as f:
    gradle = f.read()

signing_block = '''
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
'''
if "storeFile file('debug.keystore')" not in gradle:
    gradle = gradle.replace("buildTypes {", signing_block + "\n    buildTypes {")
    gradle = gradle.replace("buildTypes {\n        release {", "buildTypes {\n        debug {\n            signingConfig signingConfigs.debug\n        }\n        release {")

if "kotlin-stdlib:1.8.22" not in gradle:
    gradle += '''
configurations.all {
    resolutionStrategy {
        force 'org.jetbrains.kotlin:kotlin-stdlib:1.8.22'
        force 'org.jetbrains.kotlin:kotlin-stdlib-jdk7:1.8.22'
        force 'org.jetbrains.kotlin:kotlin-stdlib-jdk8:1.8.22'
    }
}
'''

with open(gradle_path, "w", encoding="utf-8") as f:
    f.write(gradle)

# 3. Copy Java Widget Providers, Bridge Plugin & XML layouts/drawables
pkg_dir = "android/app/src/main/java/com/brisaplan/app"
res_dir = "android/app/src/main/res"
os.makedirs(pkg_dir, exist_ok=True)
os.makedirs(f"{res_dir}/layout", exist_ok=True)
os.makedirs(f"{res_dir}/drawable", exist_ok=True)
os.makedirs(f"{res_dir}/xml", exist_ok=True)

for jfile in ["BrisaPlanWidgetHoy.java", "BrisaPlanWidgetAgenda.java", "BrisaPlanWidgetHabits.java", "BrisaWidgetBridge.java"]:
    shutil.copy(f"native-android/{jfile}", f"{pkg_dir}/{jfile}")

shutil.copy("native-android/widget_bg.xml", f"{res_dir}/drawable/widget_bg.xml")
for lay in ["widget_hoy.xml", "widget_agenda.xml", "widget_habits.xml"]:
    shutil.copy(f"native-android/{lay}", f"{res_dir}/layout/{lay}")
for inf in ["widget_info_hoy.xml", "widget_info_agenda.xml", "widget_info_habits.xml"]:
    shutil.copy(f"native-android/{inf}", f"{res_dir}/xml/{inf}")

# 4. Register BrisaWidgetBridge in MainActivity.java
main_java = f"{pkg_dir}/MainActivity.java"
if os.path.exists(main_java):
    with open(main_java, "r", encoding="utf-8") as f:
        mj = f.read()
    if "BrisaWidgetBridge" not in mj:
        if "onCreate(" in mj:
            mj = mj.replace("super.onCreate(savedInstanceState);", "registerPlugin(BrisaWidgetBridge.class);\n        super.onCreate(savedInstanceState);")
        else:
            mj = mj.replace(
                "public class MainActivity extends BridgeActivity {}",
                "import android.os.Bundle;\n\npublic class MainActivity extends BridgeActivity {\n    @Override\n    public void onCreate(Bundle savedInstanceState) {\n        registerPlugin(BrisaWidgetBridge.class);\n        super.onCreate(savedInstanceState);\n    }\n}"
            )
        with open(main_java, "w", encoding="utf-8") as f:
            f.write(mj)

# 5. Add server_client_id to strings.xml for Capacitor GoogleAuth
strings_path = f"{res_dir}/values/strings.xml"
with open(strings_path, "r", encoding="utf-8") as f:
    s_xml = f.read()
if "server_client_id" not in s_xml:
    s_xml = s_xml.replace("</resources>", '    <string name="server_client_id">1015496019382-aneel8ga9orksq1uvv1ot1d1fmg61c67.apps.googleusercontent.com</string>\n</resources>')
    with open(strings_path, "w", encoding="utf-8") as f:
        f.write(s_xml)

# 6. Inject Permissions & 3 Widget Receivers into AndroidManifest.xml
manifest_path = "android/app/src/main/AndroidManifest.xml"
with open(manifest_path, "r", encoding="utf-8") as f:
    manifest = f.read()

perms = '''
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />
    <uses-permission android:name="android.permission.USE_EXACT_ALARM" />
    <uses-permission android:name="android.permission.VIBRATE" />
    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
'''
if "POST_NOTIFICATIONS" not in manifest:
    manifest = manifest.replace("<application", perms + "\n    <application")

receivers = '''
        <receiver android:name=".BrisaPlanWidgetHoy" android:exported="true" android:label="BrisaPlan Hoy">
            <intent-filter><action android:name="android.appwidget.action.APPWIDGET_UPDATE" /></intent-filter>
            <meta-data android:name="android.appwidget.provider" android:resource="@xml/widget_info_hoy" />
        </receiver>
        <receiver android:name=".BrisaPlanWidgetAgenda" android:exported="true" android:label="BrisaPlan Agenda">
            <intent-filter><action android:name="android.appwidget.action.APPWIDGET_UPDATE" /></intent-filter>
            <meta-data android:name="android.appwidget.provider" android:resource="@xml/widget_info_agenda" />
        </receiver>
        <receiver android:name=".BrisaPlanWidgetHabits" android:exported="true" android:label="BrisaPlan Rachas">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
                <action android:name="com.brisaplan.app.ACTION_TOGGLE_HABIT" />
            </intent-filter>
            <meta-data android:name="android.appwidget.provider" android:resource="@xml/widget_info_habits" />
        </receiver>
'''
if "BrisaPlanWidgetHoy" not in manifest:
    manifest = manifest.replace("</application>", receivers + "\n    </application>")

with open(manifest_path, "w", encoding="utf-8") as f:
    f.write(manifest)

print("Injected signed keystore, 3 Java native widgets, BrisaWidgetBridge & permissions.")
