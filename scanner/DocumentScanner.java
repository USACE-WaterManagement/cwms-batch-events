import java.io.File;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Map;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.verapdf.gf.foundry.VeraGreenfieldFoundryProvider;
import org.verapdf.pdfa.Foundries;
import org.verapdf.pdfa.flavours.PDFAFlavour;

/** API scanner entry point: no CLI configuration, logs, or document text in output. */
public final class DocumentScanner {
    public static void main(String[] args) throws Exception {
        java.util.logging.LogManager.getLogManager().reset();
        // Java 21 is pinned. Fail closed if the parser attempts disk spooling or
        // network access, including when the hosting API has a writable root.
        System.setSecurityManager(new SecurityManager() {
            @Override public void checkPermission(java.security.Permission p) {
                if (p instanceof java.io.FilePermission &&
                    (p.getActions().contains("write") || p.getActions().contains("delete")))
                    throw new SecurityException("Scanner filesystem writes are disabled");
                if (p instanceof java.net.SocketPermission)
                    throw new SecurityException("Scanner networking is disabled");
                if (p instanceof RuntimePermission && p.getName().equals("setSecurityManager"))
                    throw new SecurityException("Scanner policy cannot be replaced");
            }
        });
        VeraGreenfieldFoundryProvider.initialise();
        var foundry = Foundries.defaultInstance();
        var flavour = PDFAFlavour.fromString("ua1");
        try (var parser = foundry.createParser(new File(args[0]), flavour);
             var validator = foundry.createValidator(flavour, 1, false, false, false)) {
            var result = validator.validate(parser);
            var report = new LinkedHashMap<String, Object>();
            report.put("compliant", result.isCompliant());
            report.put("profile", "PDF/UA-1");
            report.put("end_status", result.getJobEndStatus().toString());
            var findings = new ArrayList<Map<String, Object>>();
            for (var entry : result.getFailedChecks().entrySet()) {
                var id = entry.getKey();
                findings.add(Map.of("clause", id.getClause(), "test", id.getTestNumber(),
                    "count", entry.getValue(), "description",
                    result.getValidationProfile().getRuleByRuleId(id).getDescription()));
            }
            report.put("findings", findings);
            System.out.println(new ObjectMapper().writeValueAsString(report));
        }
    }
}
