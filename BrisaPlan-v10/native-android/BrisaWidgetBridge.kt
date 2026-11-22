package com.brisaplan.app

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Intent
import android.os.Build
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "BrisaWidgetBridge")
class BrisaWidgetBridge : Plugin() {

    @PluginMethod
    fun pinWidget(call: PluginCall) {
        val type = call.getString("type") ?: "hoy"
        val ctx = context
        val appWidgetManager = AppWidgetManager.getInstance(ctx)

        val providerClass = when (type) {
            "agenda" -> BrisaPlanWidgetAgenda::class.java
            "habits" -> BrisaPlanWidgetHabits::class.java
            else -> BrisaPlanWidgetHoy::class.java
        }

        val myProvider = ComponentName(ctx, providerClass)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && appWidgetManager.isRequestPinAppWidgetSupported) {
            val success = appWidgetManager.requestPinAppWidget(myProvider, null, null)
            val ret = JSObject()
            ret.put("pinned", success)
            call.resolve(ret)
        } else {
            val ret = JSObject()
            ret.put("pinned", false)
            ret.put("reason", "unsupported")
            call.resolve(ret)
        }
    }

    @PluginMethod
    fun refreshAll(call: PluginCall) {
        val ctx = context
        val mgr = AppWidgetManager.getInstance(ctx)
        listOf(BrisaPlanWidgetHoy::class.java, BrisaPlanWidgetAgenda::class.java, BrisaPlanWidgetHabits::class.java).forEach { cls ->
            val ids = mgr.getAppWidgetIds(ComponentName(ctx, cls))
            if (ids.isNotEmpty()) {
                val intent = Intent(ctx, cls).apply {
                    action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
                    putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
                }
                ctx.sendBroadcast(intent)
            }
        }
        call.resolve()
    }
}
