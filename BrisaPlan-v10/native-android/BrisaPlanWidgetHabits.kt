package com.brisaplan.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews

class BrisaPlanWidgetHabits : AppWidgetProvider() {
    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        val prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
        val streakText = prefs.getString("bp_w_habit_title", "Racha activa: 0 días")
        val detailText = prefs.getString("bp_w_habit_sub", "Mantén tu ritmo diario")

        for (id in appWidgetIds) {
            val views = RemoteViews(context.packageName, R.layout.widget_habits)
            views.setTextViewText(R.id.w_hab_title, streakText)
            views.setTextViewText(R.id.w_hab_sub, detailText)
            val pi = PendingIntent.getActivity(context, 3, Intent(context, MainActivity::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            views.setOnClickPendingIntent(R.id.w_hab_root, pi)
            appWidgetManager.updateAppWidget(id, views)
        }
    }
}
