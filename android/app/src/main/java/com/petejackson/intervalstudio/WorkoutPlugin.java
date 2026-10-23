package com.petejackson.intervalstudio;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.net.Uri;
import android.os.Looper;
import androidx.activity.result.ActivityResult;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * The link between the web app (js/native.js) and WorkoutService.
 *
 * JavaScript calls:  update({...})  to show / refresh the lock-screen card
 *                    stop()         to remove it
 * Android sends back an "action" event: prev, toggle, play, pause, next, or tick.
 *
 * Library backup (Settings > Export library):
 *                    saveFile({name, text})   Android's "Save as" screen: the person picks
 *                                             the folder (Downloads, Google Drive, ...)
 *                    shareFile({name, text})  the share sheet (WhatsApp, email, Drive, ...)
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

    // ----- library backup -----

    /** Opens Android's "Save as" screen. Resolves { saved: true } or { saved: false } if cancelled. */
    @PluginMethod
    public void saveFile(PluginCall call) {
        if (call.getString("text") == null) {
            call.reject("Nothing to save");
            return;
        }
        Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("application/json");
        i.putExtra(Intent.EXTRA_TITLE, safeName(call.getString("name", "interval-studio-workouts.json")));
        startActivityForResult(call, i, "saveFileResult");
    }

    @ActivityCallback
    private void saveFileResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject ret = new JSObject();
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            ret.put("saved", false); // the person backed out of the Save screen
            call.resolve(ret);
            return;
        }
        Uri uri = data.getData();
        try (OutputStream out = getContext().getContentResolver().openOutputStream(uri)) {
            if (out == null) throw new Exception("Could not open the file");
            out.write(call.getString("text", "").getBytes(StandardCharsets.UTF_8));
            ret.put("saved", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not save the file", e);
        }
    }

    /** Writes the backup to the app's private cache, then offers it through the share sheet. */
    @PluginMethod
    public void shareFile(PluginCall call) {
        String text = call.getString("text");
        if (text == null) {
            call.reject("Nothing to share");
            return;
        }
        String name = safeName(call.getString("name", "interval-studio-workouts.json"));
        try {
            File dir = new File(getContext().getCacheDir(), "backup");
            if (!dir.exists() && !dir.mkdirs()) throw new Exception("Could not make the backup folder");
            File file = new File(dir, name);
            try (FileOutputStream out = new FileOutputStream(file)) {
                out.write(text.getBytes(StandardCharsets.UTF_8));
            }
            // FileProvider (declared in AndroidManifest.xml) lets the chosen app read this one file.
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("application/json");
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.putExtra(Intent.EXTRA_SUBJECT, "Interval Studio backup");
            send.setClipData(ClipData.newRawUri(name, uri));
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            final Intent chooser = Intent.createChooser(send, "Save or send your workouts");
            final Activity activity = getActivity();
            if (activity == null) throw new Exception("App not open");
            activity.runOnUiThread(() -> activity.startActivity(chooser));
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not share the file", e);
        }
    }

    /** Keeps file names to plain letters, numbers, dots, dashes and underscores. */
    private static String safeName(String name) {
        String n = name == null ? "" : name.replaceAll("[^A-Za-z0-9._-]", "_");
        if (n.isEmpty() || n.startsWith(".")) n = "interval-studio-workouts.json";
        return n.length() > 80 ? n.substring(0, 80) : n;
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
