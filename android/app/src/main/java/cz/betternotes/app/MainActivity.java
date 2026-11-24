package cz.betternotes.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CzechVoicePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
