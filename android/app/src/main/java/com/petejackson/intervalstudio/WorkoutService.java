package com.petejackson.intervalstudio;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.graphics.drawable.Icon;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import androidx.core.content.ContextCompat;

/**
 * Keeps a workout going while the screen is off and shows it on the lock screen.
 *
 * The web app (player.js) stays in charge: it works out which section is
 * running and sends it here through WorkoutPlugin. This service only:
 *   1. shows a coloured media-style card (lock screen + notification shade)
 *      with Previous / Pause-Play / Next buttons,
 *   2. sends button presses back to the web app,
 *   3. nudges the web app 4 times a second ("tick") so its timer and voice
 *      cues keep running when Android slows down hidden web pages,
 *   4. holds a partial wake lock while running so the phone doesn't doze.
 */
public class WorkoutService extends Service {

    /** What the card shows. Filled in by WorkoutPlugin from the web app. */
    static class State {
        String workout = "";
        String label = "Interval Studio";
        String color = "#F0343F";
        String remaining = "";
        String detail = "";
        String next = "";
        String totalLeft = "";
        boolean running = true;
        long segMs = 0;
        long posMs = 0;
    }

    private static final String CHANNEL_ID = "workout";
    private static final int NOTIFICATION_ID = 4711;
    private static final String ACTION_PREV = "com.petejackson.intervalstudio.PREV";
    private static final String ACTION_TOGGLE = "com.petejackson.intervalstudio.TOGGLE";
    private static final String ACTION_NEXT = "com.petejackson.intervalstudio.NEXT";

    private static State latest;
    private static WorkoutService instance;

    private MediaSession session;
    private PowerManager.WakeLock wakeLock;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private String artKey;
    private Bitmap art;

    private final Runnable heartbeat = new Runnable() {
        @Override
        public void run() {
            State s = latest;
            if (s != null && s.running) WorkoutPlugin.emit("tick");
            handler.postDelayed(this, 250);
        }
    };

    // ----- called by WorkoutPlugin (on the main thread) -----

    static void update(Context ctx, State s) {
        latest = s;
        if (instance != null) {
            instance.render();
            return;
        }
        try {
            ContextCompat.startForegroundService(ctx, new Intent(ctx, WorkoutService.class));
        } catch (Exception e) {
            // Android refused to start it (app in the background). The workout still runs in the app.
        }
    }

    static void stop() {
        latest = null;
        if (instance != null) instance.shutDown();
    }

    // ----- service lifecycle -----

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
        session = new MediaSession(this, "IntervalStudio");
        session.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { WorkoutPlugin.emit("play"); }
            @Override public void onPause() { WorkoutPlugin.emit("pause"); }
            @Override public void onSkipToNext() { WorkoutPlugin.emit("next"); }
            @Override public void onSkipToPrevious() { WorkoutPlugin.emit("prev"); }
        });
        session.setActive(true);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (action != null) {
            // A button on the card was pressed.
            if (ACTION_PREV.equals(action)) WorkoutPlugin.emit("prev");
            else if (ACTION_TOGGLE.equals(action)) WorkoutPlugin.emit("toggle");
            else if (ACTION_NEXT.equals(action)) WorkoutPlugin.emit("next");
            if (latest == null) stopSelf();
            return START_NOT_STICKY;
        }
        instance = this;
        Notification n = buildNotification();
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIFICATION_ID, n);
        }
        if (latest == null) {
            shutDown();
        } else {
            handler.removeCallbacks(heartbeat);
            handler.post(heartbeat);
            updateWakeLock();
        }
        return START_NOT_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // The app was swiped away: the workout is gone, so is the card.
        stop();
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        if (instance == this) instance = null;
        handler.removeCallbacksAndMessages(null);
        releaseWakeLock();
        if (session != null) session.release();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void shutDown() {
        if (instance == this) instance = null;
        handler.removeCallbacks(heartbeat);
        releaseWakeLock();
        // Keep the CPU awake a few more seconds so the "workout complete" sound can finish.
        try {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "IntervalStudio:finish").acquire(4000);
        } catch (Exception ignored) { }
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    // ----- drawing the card -----

    private void render() {
        if (latest == null) return;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.notify(NOTIFICATION_ID, buildNotification());
        updateWakeLock();
    }

    private Notification buildNotification() {
        State s = latest != null ? latest : new State();
        int color = parseColor(s.color);
        Bitmap artwork = artwork(s, color);
        String title = s.remaining.isEmpty() ? s.label : s.label + "  " + s.remaining;

        // Android 13+ draws the lock-screen player from the media session:
        // title, subtitle, artwork (our solid section colour) and a progress bar.
        session.setMetadata(new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, title)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, s.detail)
                .putString(MediaMetadata.METADATA_KEY_ALBUM, s.totalLeft)
                .putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, artwork)
                .putLong(MediaMetadata.METADATA_KEY_DURATION, s.segMs)
                .build());
        session.setPlaybackState(new PlaybackState.Builder()
                .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE
                        | PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS)
                .setState(s.running ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,
                        s.posMs, s.running ? 1f : 0f)
                .build());

        Notification.Builder b = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);
        b.setSmallIcon(R.drawable.ic_stat_interval)
                .setContentTitle(title)
                .setContentText(s.detail)
                .setSubText(s.totalLeft)
                .setLargeIcon(artwork)
                .setColor(color)
                .setOngoing(true)
                .setShowWhen(false)
                .setOnlyAlertOnce(true)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setCategory(Notification.CATEGORY_TRANSPORT)
                .setContentIntent(openAppIntent())
                .addAction(action(R.drawable.ic_n_prev, "Previous section", ACTION_PREV, 1))
                .addAction(s.running
                        ? action(R.drawable.ic_n_pause, "Pause", ACTION_TOGGLE, 2)
                        : action(R.drawable.ic_n_play, "Resume", ACTION_TOGGLE, 2))
                .addAction(action(R.drawable.ic_n_next, "Next section", ACTION_NEXT, 3))
                .setStyle(new Notification.MediaStyle()
                        .setMediaSession(session.getSessionToken())
                        .setShowActionsInCompactView(0, 1, 2));
        if (Build.VERSION.SDK_INT >= 26) b.setColorized(true);
        if (Build.VERSION.SDK_INT >= 31) b.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE);
        return b.build();
    }

    private Notification.Action action(int icon, String title, String act, int requestCode) {
        Intent i = new Intent(this, WorkoutService.class).setAction(act);
        PendingIntent pi = PendingIntent.getService(this, requestCode, i,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new Notification.Action.Builder(Icon.createWithResource(this, icon), title, pi).build();
    }

    private PendingIntent openAppIntent() {
        Intent i = new Intent(this, MainActivity.class)
                .setAction(Intent.ACTION_MAIN)
                .addCategory(Intent.CATEGORY_LAUNCHER)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(this, 0, i,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /** A square in the section's colour with its name and what's next. Redrawn only when the section changes. */
    private Bitmap artwork(State s, int color) {
        String key = s.label + "|" + s.color + "|" + s.next;
        if (art != null && key.equals(artKey)) return art;
        int size = 512;
        Bitmap b = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(b);
        c.drawColor(color);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(Color.WHITE);
        p.setTextAlign(Paint.Align.CENTER);
        p.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
        fitText(p, s.label, 100f, size - 64);
        c.drawText(s.label, size / 2f, size * 0.50f, p);
        if (!s.next.isEmpty()) {
            p.setTypeface(Typeface.DEFAULT);
            p.setAlpha(225);
            fitText(p, s.next, 40f, size - 64);
            c.drawText(s.next, size / 2f, size * 0.64f, p);
        }
        artKey = key;
        art = b;
        return b;
    }

    private static void fitText(Paint p, String text, float max, float width) {
        p.setTextSize(max);
        float w = p.measureText(text);
        if (w > width) p.setTextSize(max * width / w);
    }

    private static int parseColor(String s) {
        try {
            return Color.parseColor(s);
        } catch (Exception e) {
            return Color.parseColor("#F0343F");
        }
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "Workout in progress",
                NotificationManager.IMPORTANCE_LOW);
        ch.setDescription("Shows the running workout on the lock screen with pause and skip buttons");
        ch.setShowBadge(false);
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        ch.setSound(null, null);
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.createNotificationChannel(ch);
    }

    // ----- keeping the phone awake while running -----

    private void updateWakeLock() {
        State s = latest;
        if (s != null && s.running) {
            if (wakeLock == null) {
                PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "IntervalStudio:workout");
                wakeLock.setReferenceCounted(false);
            }
            if (!wakeLock.isHeld()) wakeLock.acquire(3 * 60 * 60 * 1000L); // safety limit: 3 hours
        } else {
            releaseWakeLock();
        }
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
    }
}
