package com.agentdevice.installerreview;
import android.app.Activity;
import android.os.Bundle;
import android.widget.LinearLayout;
import android.widget.TextView;
public class MainActivity extends Activity {
 @Override public void onCreate(Bundle state) {
  super.onCreate(state);
  LinearLayout layout = new LinearLayout(this);
  layout.setOrientation(LinearLayout.VERTICAL);
  layout.setPadding(32, 64, 32, 32);
  android.widget.Button title = new android.widget.Button(this);
  title.setText("Installer review version 2");
  title.setTextSize(24);
  layout.addView(title);
  TextView message = new TextView(this);
  message.setText("Native Android install verification");
  message.setTextSize(18);
  layout.addView(message);
  setContentView(layout);
 }
}
