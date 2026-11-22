package com.brisaplan.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews

class BrisaPlanWidgetHoy : AppWidgetProvider() {
    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        val prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
        val summary = prefs.getString("bp_w_hoy_title", "Todo al día • 0 pendientes")
        val nextTask = prefs.getString("bp_w_hoy_sub", "Toca para abrir BrisaPlan")

        for (id in appWidgetIds) {
            val views = RemoteViews(context.packageName, R.layout.widget_hoy)
            views.setTextViewText(R.id.w_hoy_title, summary)
            views.setTextViewText(R.id.w_hoy_sub, nextTask)
            val pi = PendingIntent.getActivity(context, 1, Intent(context, MainActivity::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            views.setOnClickPendingIntent(R.id.w_hoy_root, pi)
            appWidgetManager.updateAppWidget(id, views)
        }
    }
}
