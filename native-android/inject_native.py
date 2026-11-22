import os, shutil

# 1. Fixed debug keystore
os.makedirs(os.path.expanduser("~/.android"), exist_ok=True)
shutil.copy("native-android/brisaplan-debug.keystore", os.path.expanduser("~/.android/debug.keystore"))
shutil.copy("native-android/brisaplan-debug.keystore", "android/app/debug.keystore")

# 2. Enforce signingConfig in android/app/build.gradle
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

with open(gradle_path, "w", encoding="utf-8") as f:
    f.write(gradle)

# 3. Write pure Java Widgets & Plugin (works out-of-the-box without Kotlin plugin)
pkg_dir = "android/app/src/main/java/com/brisaplan/app"
res_dir = "android/app/src/main/res"
os.makedirs(pkg_dir, exist_ok=True)
os.makedirs(f"{res_dir}/layout", exist_ok=True)
os.makedirs(f"{res_dir}/drawable", exist_ok=True)
os.makedirs(f"{res_dir}/xml", exist_ok=True)

# Remove old .kt files if present
for old_kt in ["BrisaPlanWidgetHoy.kt", "BrisaPlanWidgetAgenda.kt", "BrisaPlanWidgetHabits.kt", "BrisaWidgetBridge.kt", "BrisaPlanWidgetProvider.kt"]:
    p = f"{pkg_dir}/{old_kt}"
    if os.path.exists(p):
        os.remove(p)

widget_hoy_java = """package com.brisaplan.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

public class BrisaPlanWidgetHoy extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        SharedPreferences prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
        String summary = prefs.getString("bp_w_hoy_title", "Todo al día • 0 pendientes");
        String nextTask = prefs.getString("bp_w_hoy_sub", "Toca para abrir BrisaPlan");

        for (int id : appWidgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_hoy);
            views.setTextViewText(R.id.w_hoy_title, summary);
            views.setTextViewText(R.id.w_hoy_sub, nextTask);
            PendingIntent pi = PendingIntent.getActivity(context, 1, new Intent(context, MainActivity.class), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            views.setOnClickPendingIntent(R.id.w_hoy_root, pi);
            appWidgetManager.updateAppWidget(id, views);
        }
    }
}
"""

widget_agenda_java = """package com.brisaplan.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

public class BrisaPlanWidgetAgenda extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        SharedPreferences prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
        String line1 = prefs.getString("bp_w_agenda_1", "Sin bloques programados hoy");
        String line2 = prefs.getString("bp_w_agenda_2", "Agenda semanal lista");

        for (int id : appWidgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_agenda);
            views.setTextViewText(R.id.w_ag_line1, line1);
            views.setTextViewText(R.id.w_ag_line2, line2);
            PendingIntent pi = PendingIntent.getActivity(context, 2, new Intent(context, MainActivity.class), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            views.setOnClickPendingIntent(R.id.w_ag_root, pi);
            appWidgetManager.updateAppWidget(id, views);
        }
    }
}
"""

widget_habits_java = """package com.brisaplan.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

public class BrisaPlanWidgetHabits extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        SharedPreferences prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
        String streakText = prefs.getString("bp_w_habit_title", "Racha activa: 0 días");
        String detailText = prefs.getString("bp_w_habit_sub", "Mantén tu ritmo diario");

        for (int id : appWidgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_habits);
            views.setTextViewText(R.id.w_hab_title, streakText);
            views.setTextViewText(R.id.w_hab_sub, detailText);
            PendingIntent pi = PendingIntent.getActivity(context, 3, new Intent(context, MainActivity.class), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            views.setOnClickPendingIntent(R.id.w_hab_root, pi);
            appWidgetManager.updateAppWidget(id, views);
        }
    }
}
"""

widget_bridge_java = """package com.brisaplan.app;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "BrisaWidgetBridge")
public class BrisaWidgetBridge extends Plugin {

    @PluginMethod
    public void pinWidget(PluginCall call) {
        String type = call.getString("type", "hoy");
        Context ctx = getContext();
        AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(ctx);

        Class<?> providerClass;
        if ("agenda".equals(type)) {
            providerClass = BrisaPlanWidgetAgenda.class;
        } else if ("habits".equals(type)) {
            providerClass = BrisaPlanWidgetHabits.class;
        } else {
            providerClass = BrisaPlanWidgetHoy.class;
        }

        ComponentName myProvider = new ComponentName(ctx, providerClass);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && appWidgetManager.isRequestPinAppWidgetSupported()) {
            boolean success = appWidgetManager.requestPinAppWidget(myProvider, null, null);
            JSObject ret = new JSObject();
            ret.put("pinned", success);
            call.resolve(ret);
        } else {
            JSObject ret = new JSObject();
            ret.put("pinned", false);
            ret.put("reason", "unsupported");
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void refreshAll(PluginCall call) {
        Context ctx = getContext();
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        Class<?>[] classes = new Class<?>[]{BrisaPlanWidgetHoy.class, BrisaPlanWidgetAgenda.class, BrisaPlanWidgetHabits.class};
        for (Class<?> cls : classes) {
            int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, cls));
            if (ids != null && ids.length > 0) {
                Intent intent = new Intent(ctx, cls);
                intent.setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
                intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids);
                ctx.sendBroadcast(intent);
            }
        }
        call.resolve();
    }
}
"""

for fname, code in [
    ("BrisaPlanWidgetHoy.java", widget_hoy_java),
    ("BrisaPlanWidgetAgenda.java", widget_agenda_java),
    ("BrisaPlanWidgetHabits.java", widget_habits_java),
    ("BrisaWidgetBridge.java", widget_bridge_java),
]:
    with open(f"{pkg_dir}/{fname}", "w", encoding="utf-8") as f:
        f.write(code)

# 4. Copy XML resources
shutil.copy("native-android/widget_bg.xml", f"{res_dir}/drawable/widget_bg.xml")
for lay in ["widget_hoy.xml", "widget_agenda.xml", "widget_habits.xml"]:
    shutil.copy(f"native-android/{lay}", f"{res_dir}/layout/{lay}")
for inf in ["widget_info_hoy.xml", "widget_info_agenda.xml", "widget_info_habits.xml"]:
    shutil.copy(f"native-android/{inf}", f"{res_dir}/xml/{inf}")

# 5. Register BrisaWidgetBridge in MainActivity.java
main_java = f"{pkg_dir}/MainActivity.java"
if os.path.exists(main_java):
    with open(main_java, "r", encoding="utf-8") as f:
        mj = f.read()
    if "BrisaWidgetBridge" not in mj:
        if "onCreate(" in mj:
            mj = mj.replace("super.onCreate(savedInstanceState);", "registerPlugin(BrisaWidgetBridge.class);\n        super.onCreate(savedInstanceState);")
        else:
            mj = mj.replace("public class MainActivity extends BridgeActivity {}", "import android.os.Bundle;\npublic class MainActivity extends BridgeActivity {\n    @Override\n    public void onCreate(Bundle savedInstanceState) {\n        registerPlugin(BrisaWidgetBridge.class);\n        super.onCreate(savedInstanceState);\n    }\n}")
        with open(main_java, "w", encoding="utf-8") as f:
            f.write(mj)

# 6. Add server_client_id to strings.xml
strings_path = f"{res_dir}/values/strings.xml"
with open(strings_path, "r", encoding="utf-8") as f:
    s_xml = f.read()
if "server_client_id" not in s_xml:
    s_xml = s_xml.replace("</resources>", '    <string name="server_client_id">1015496019382-aneel8ga9orksq1uvv1ot1d1fmg61c67.apps.googleusercontent.com</string>\n</resources>')
    with open(strings_path, "w", encoding="utf-8") as f:
        f.write(s_xml)

# 7. Inject Permissions & 3 Widget Receivers into AndroidManifest.xml
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
            <intent-filter><action android:name="android.appwidget.action.APPWIDGET_UPDATE" /></intent-filter>
            <meta-data android:name="android.appwidget.provider" android:resource="@xml/widget_info_habits" />
        </receiver>
'''
if "BrisaPlanWidgetHoy" not in manifest:
    manifest = manifest.replace("</application>", receivers + "\n    </application>")

with open(manifest_path, "w", encoding="utf-8") as f:
    f.write(manifest)

print("V10 Java Widgets, Bridge, SigningConfig & Manifest injected successfully.")
