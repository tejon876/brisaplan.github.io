package com.brisaplan.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.widget.RemoteViews;

public class BrisaPlanWidgetHoy extends AppWidgetProvider {
    private static int safeColor(String hex, String fallback) {
        try {
            return Color.parseColor(hex != null && hex.startsWith("#") ? hex : fallback);
        } catch (Exception e) {
            return Color.parseColor(fallback);
        }
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        SharedPreferences prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
        String summary = prefs.getString("bp_w_hoy_title", "Todo al día • 0 pendientes");
        String nextTask = prefs.getString("bp_w_hoy_sub", "Toca para abrir BrisaPlan");
        String hex = prefs.getString("bp_w_hoy_color", "#4A93C6");
        int accentColor = safeColor(hex, "#4A93C6");

        for (int id : appWidgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_hoy);
            views.setInt(R.id.w_hoy_accent, "setBackgroundColor", accentColor);
            views.setTextColor(R.id.w_hoy_badge, accentColor);
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
