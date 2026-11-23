package com.brisaplan.app;

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
            PendingIntent pi = PendingIntent.getActivity(
                context, 3, new Intent(context, MainActivity.class),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            views.setOnClickPendingIntent(R.id.w_hab_root, pi);
            appWidgetManager.updateAppWidget(id, views);
        }
    }
}
