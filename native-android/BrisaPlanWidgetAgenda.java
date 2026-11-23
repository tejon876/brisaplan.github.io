package com.brisaplan.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

public class BrisaPlanWidgetAgenda extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        SharedPreferences prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
        String line1 = prefs.getString("bp_w_agenda_1", "Sin bloques programados hoy");
        String line2 = prefs.getString("bp_w_agenda_2", "Agenda semanal lista");

        for (int id : appWidgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_agenda);
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
