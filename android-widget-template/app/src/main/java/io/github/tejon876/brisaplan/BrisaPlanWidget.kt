package io.github.tejon876.brisaplan

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews

class BrisaPlanWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (appWidgetId in appWidgetIds) {
            val intent = Intent(context, MainActivity::class.java)
            val pendingIntent = PendingIntent.getActivity(
                context,
                0,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val views = RemoteViews(context.packageName, R.layout.brisaplan_widget)
            views.setOnClickPendingIntent(R.id.widget_title, pendingIntent)
            views.setOnClickPendingIntent(R.id.widget_summary, pendingIntent)

            val prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
            val summary = prefs.getString("brisaplan_widget_summary", "Abre BrisaPlan para ver tus bloques y entregas de hoy.")
            views.setTextViewText(R.id.widget_summary, summary)

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}
