package com.brisaplan.app;

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
            PendingIntent pi = PendingIntent.getActivity(
                context, 1, new Intent(context, MainActivity.class),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            views.setOnClickPendingIntent(R.id.w_hoy_root, pi);
            appWidgetManager.updateAppWidget(id, views);
        }
    }
}
