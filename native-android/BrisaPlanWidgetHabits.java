package com.brisaplan.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.widget.RemoteViews;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class BrisaPlanWidgetHabits extends AppWidgetProvider {
    public static final String ACTION_TOGGLE_HABIT = "com.brisaplan.app.ACTION_TOGGLE_HABIT";

    private static int safeColor(String hex, String fallback) {
        try {
            return Color.parseColor(hex != null && hex.startsWith("#") ? hex : fallback);
        } catch (Exception e) {
            return Color.parseColor(fallback);
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (ACTION_TOGGLE_HABIT.equals(intent.getAction())) {
            SharedPreferences prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
            String today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
            boolean doneToday = "1".equals(prefs.getString("bp_w_habit_done", "0"))
                && today.equals(prefs.getString("bp_w_habit_date", ""));

            int total = 0;
            int doneCount = 0;
            int maxStreak = 0;
            try { total = Integer.parseInt(prefs.getString("bp_w_habit_total", "0")); } catch (Exception ignored) {}
            try { doneCount = Integer.parseInt(prefs.getString("bp_w_habit_done_count", "0")); } catch (Exception ignored) {}
            try { maxStreak = Integer.parseInt(prefs.getString("bp_w_habit_streak", "0")); } catch (Exception ignored) {}

            SharedPreferences.Editor ed = prefs.edit();
            if (!doneToday) {
                int newDone = total > 0 ? Math.min(total, doneCount + 1) : 1;
                int newTotal = Math.max(total, newDone);
                int newStreak = maxStreak + 1;
                ed.putString("bp_w_habit_done", "1");
                ed.putString("bp_w_habit_date", today);
                ed.putString("bp_w_habit_done_count", String.valueOf(newDone));
                ed.putString("bp_w_habit_total", String.valueOf(newTotal));
                ed.putString("bp_w_habit_streak", String.valueOf(newStreak));
                ed.putString("bp_w_habit_title", "Racha activa: " + newStreak + (newStreak == 1 ? " día" : " días"));
                ed.putString("bp_w_habit_sub", "Completado hoy (" + newDone + "/" + newTotal + ") ✓");
                ed.putString("bp_w_habit_pending_toggle", today);
            } else {
                int newDone = Math.max(0, doneCount - 1);
                int newStreak = Math.max(0, maxStreak - 1);
                ed.putString("bp_w_habit_done", "0");
                ed.putString("bp_w_habit_date", today);
                ed.putString("bp_w_habit_done_count", String.valueOf(newDone));
                ed.putString("bp_w_habit_streak", String.valueOf(newStreak));
                ed.putString("bp_w_habit_title", "Racha máxima: " + newStreak + (newStreak == 1 ? " día" : " días"));
                ed.putString("bp_w_habit_sub", "Hoy: " + newDone + "/" + total + " hábitos");
                ed.putString("bp_w_habit_pending_toggle", "UNDO:" + today);
            }
            ed.apply();

            AppWidgetManager mgr = AppWidgetManager.getInstance(context);
            int[] ids = mgr.getAppWidgetIds(new ComponentName(context, BrisaPlanWidgetHabits.class));
            if (ids != null && ids.length > 0) {
                onUpdate(context, mgr, ids);
            }
        }
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        SharedPreferences prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
        String today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
        boolean doneToday = "1".equals(prefs.getString("bp_w_habit_done", "0"))
            && today.equals(prefs.getString("bp_w_habit_date", ""));

        String streakText = prefs.getString("bp_w_habit_title", "Racha activa: 0 días");
        String detailText = prefs.getString("bp_w_habit_sub", "Mantén tu ritmo diario");
        String hex = doneToday ? "#10B981" : prefs.getString("bp_w_habit_color", "#10B981");
        int accentColor = safeColor(hex, "#10B981");

        for (int id : appWidgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_habits);
            views.setInt(R.id.w_hab_accent, "setBackgroundColor", accentColor);
            views.setTextColor(R.id.w_hab_badge, accentColor);
            views.setTextViewText(R.id.w_hab_title, streakText);
            views.setTextViewText(R.id.w_hab_sub, detailText);

            if (doneToday) {
                views.setTextViewText(R.id.w_hab_check_btn, "✓ Hecho");
                views.setInt(R.id.w_hab_check_btn, "setBackgroundColor", Color.parseColor("#10B981"));
                views.setTextColor(R.id.w_hab_check_btn, Color.parseColor("#052E16"));
            } else {
                views.setTextViewText(R.id.w_hab_check_btn, "Marcar");
                views.setInt(R.id.w_hab_check_btn, "setBackgroundColor", Color.parseColor("#334155"));
                views.setTextColor(R.id.w_hab_check_btn, Color.parseColor("#F8FAFC"));
            }

            PendingIntent openAppPi = PendingIntent.getActivity(
                context, 3, new Intent(context, MainActivity.class),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            views.setOnClickPendingIntent(R.id.w_hab_text_box, openAppPi);

            Intent toggleIntent = new Intent(context, BrisaPlanWidgetHabits.class);
            toggleIntent.setAction(ACTION_TOGGLE_HABIT);
            PendingIntent togglePi = PendingIntent.getBroadcast(
                context, 31, toggleIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            views.setOnClickPendingIntent(R.id.w_hab_check_btn, togglePi);

            appWidgetManager.updateAppWidget(id, views);
        }
    }
}
