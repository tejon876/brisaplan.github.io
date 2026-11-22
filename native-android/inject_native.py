import os, shutil

# 1. Copy fixed debug keystore so SHA-1 stays consistent across builds
os.makedirs(os.path.expanduser("~/.android"), exist_ok=True)
shutil.copy("native-android/brisaplan-debug.keystore", os.path.expanduser("~/.android/debug.keystore"))
shutil.copy("native-android/brisaplan-debug.keystore", "android/app/debug.keystore")

# 2. Copy Widget Kotlin & XML resources
pkg_dir = "android/app/src/main/java/com/brisaplan/app"
res_dir = "android/app/src/main/res"
os.makedirs(pkg_dir, exist_ok=True)
os.makedirs(f"{res_dir}/layout", exist_ok=True)
os.makedirs(f"{res_dir}/drawable", exist_ok=True)
os.makedirs(f"{res_dir}/xml", exist_ok=True)

shutil.copy("native-android/BrisaPlanWidgetProvider.kt", f"{pkg_dir}/BrisaPlanWidgetProvider.kt")
shutil.copy("native-android/brisaplan_widget.xml", f"{res_dir}/layout/brisaplan_widget.xml")
shutil.copy("native-android/widget_bg.xml", f"{res_dir}/drawable/widget_bg.xml")
shutil.copy("native-android/brisaplan_widget_info.xml", f"{res_dir}/xml/brisaplan_widget_info.xml")

# 3. Add widget_description to strings.xml
strings_path = f"{res_dir}/values/strings.xml"
with open(strings_path, "r", encoding="utf-8") as f:
    s_xml = f.read()
if "widget_description" not in s_xml:
    s_xml = s_xml.replace("</resources>", '    <string name="widget_description">Resumen de tareas y hábitos de BrisaPlan</string>\n</resources>')
    with open(strings_path, "w", encoding="utf-8") as f:
        f.write(s_xml)

# 4. Inject Permissions & Widget Receiver into AndroidManifest.xml
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

receiver = '''
        <receiver
            android:name=".BrisaPlanWidgetProvider"
            android:exported="true"
            android:label="BrisaPlan Hoy">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
            </intent-filter>
            <meta-data
                android:name="android.appwidget.provider"
                android:resource="@xml/brisaplan_widget_info" />
        </receiver>
'''

if "BrisaPlanWidgetProvider" not in manifest:
    manifest = manifest.replace("</application>", receiver + "\n    </application>")

with open(manifest_path, "w", encoding="utf-8") as f:
    f.write(manifest)

print("Native Android Widget, Permissions & Keystore injected successfully.")
