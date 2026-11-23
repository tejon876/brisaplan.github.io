package com.brisaplan.app;

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
        Class<?>[] providers = new Class<?>[] {
            BrisaPlanWidgetHoy.class,
            BrisaPlanWidgetAgenda.class,
            BrisaPlanWidgetHabits.class
        };
        for (Class<?> cls : providers) {
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
