package com.petejackson.intervalstudio;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Our own plugin for the lock-screen workout card. Must be registered before super.onCreate.
        registerPlugin(WorkoutPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
