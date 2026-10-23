package com.petejackson.intervalstudio;

import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Our own plugin for the lock-screen workout card. Must be registered before super.onCreate.
        registerPlugin(WorkoutPlugin.class);
        super.onCreate(savedInstanceState);

        // Back button / back swipe. Ask the web app first (IT.back() in app.js):
        // it closes a sheet, leaves the editor, and so on, and answers "handled".
        // Anything else - including a running workout - just sends the app to the
        // background, like the Home button. The app is never closed by Back, so a
        // workout can't be lost by accident.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView web = getBridge() != null ? getBridge().getWebView() : null;
                if (web == null) {
                    moveTaskToBack(true);
                    return;
                }
                web.evaluateJavascript("(window.IT && IT.back) ? IT.back() : 'exit'", value -> {
                    if (!"\"handled\"".equals(value)) moveTaskToBack(true);
                });
            }
        });
    }
}
