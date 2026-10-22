package com.petejackson.intervalstudio;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The link between the web app (js/native.js) and WorkoutService.
 *
 * JavaScript calls:  update({...})  to show / refresh the lock-screen card
 *                    stop()         to remove it
 * Android sends back an "action" event: prev, toggle, play, pause, next, or tick.
 */
@CapacitorPlugin(name = "WorkoutNotification")
public class WorkoutPlugin extends Plugin {

    private static WorkoutPlugin instance;
    private final Handler main = new Handler(Looper.getMainLooper());
    private boolean askedForNotifications = false;

    @Override
    public void load() {
        instance = this;
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) instance = null;
        main.post(WorkoutService::stop);
    }

    /** Sends a button press (or the heartbeat tick) to the web app. */
    static void emit(String action) {
        WorkoutPlugin p = instance;
        if (p == null) return;
        JSObject data = new JSObject();
        data.put("action", action);
        p.notifyListeners("action", data);
    }

    @PluginMethod
    public void update(PluginCall call) {
        final WorkoutService.State s = new WorkoutService.State();
        s.workout = call.getString("workout", "");
        s.label = call.getString("label", "");
        s.color = call.getString("color", "#F0343F");
        s.remaining = call.getString("remaining", "");
        s.detail = call.getString("detail", "");
        s.next = call.getString("next", "");
        s.totalLeft = call.getString("totalLeft", "");
        s.running = Boolean.TRUE.equals(call.getBoolean("running", true));
        s.segMs = toLong(call.getDouble("segMs", 0.0));
        s.posMs = toLong(call.getDouble("posMs", 0.0));
        final Context ctx = getContext();
        main.post(() -> {
            askForNotificationsOnce();
            WorkoutService.update(ctx, s);
        });
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        main.post(WorkoutService::stop);
        call.resolve();
    }

    private static long toLong(Double d) {
        return d == null ? 0 : Math.round(d);
    }

    // Android 13+ asks before an app may show notifications. Ask once per app
    // launch, the first time a workout starts.
    private void askForNotificationsOnce() {
        if (askedForNotifications || Build.VERSION.SDK_INT < 33 || getActivity() == null) return;
        askedForNotifications = true;
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(getActivity(), new String[] { Manifest.permission.POST_NOTIFICATIONS }, 4712);
        }
    }
}
