package com.brisaplan.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.widget.RemoteViews;

public class BrisaPlanWidgetAgenda extends AppWidgetProvider {
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
        String line1 = prefs.getString("bp_w_agenda_1", "Sin bloques programados hoy");
        String line2 = prefs.getString("bp_w_agenda_2", "Agenda semanal lista");
        String hex = prefs.getString("bp_w_agenda_color", "#F59E0B");
        int accentColor = safeColor(hex, "#F59E0B");

        for (int id : appWidgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_agenda);
            views.setInt(R.id.w_ag_accent, "setBackgroundColor", accentColor);
            views.setTextColor(R.id.w_ag_badge, accentColor);
            views.setTextViewText(R.id.w_ag_line1, line1);
            views.setTextViewText(R.id.w_ag_line2, line2);
            PendingIntent pi = PendingIntent.getActivity(
                context, 2, new Intent(context, MainActivity.class),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            views.setOnClickPendingIntent(R.id.w_ag_root, pi);
            appWidgetManager.updateAppWidget(id, views);
        }
    }
}
