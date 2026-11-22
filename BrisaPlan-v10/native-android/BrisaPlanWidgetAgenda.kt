package com.brisaplan.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews

class BrisaPlanWidgetAgenda : AppWidgetProvider() {
    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        val prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
        val line1 = prefs.getString("bp_w_agenda_1", "Sin bloques programados hoy")
        val line2 = prefs.getString("bp_w_agenda_2", "Agenda semanal lista")

        for (id in appWidgetIds) {
            val views = RemoteViews(context.packageName, R.layout.widget_agenda)
            views.setTextViewText(R.id.w_ag_line1, line1)
            views.setTextViewText(R.id.w_ag_line2, line2)
            val pi = PendingIntent.getActivity(context, 2, Intent(context, MainActivity::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            views.setOnClickPendingIntent(R.id.w_ag_root, pi)
            appWidgetManager.updateAppWidget(id, views)
        }
    }
}
