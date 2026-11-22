package com.brisaplan.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews

class BrisaPlanWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        val prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
        val summary = prefs.getString("brisaplan_widget_summary", "Sin tareas urgentes hoy")
        val nextTask = prefs.getString("brisaplan_widget_next", "Toca para abrir BrisaPlan")

        for (appWidgetId in appWidgetIds) {
            val views = RemoteViews(context.packageName, R.layout.brisaplan_widget)
            views.setTextViewText(R.id.widget_summary_text, summary)
            views.setTextViewText(R.id.widget_next_text, nextTask)

            val intent = Intent(context, MainActivity::class.java)
            val pendingIntent = PendingIntent.getActivity(
                context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_root, pendingIntent)
            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}
